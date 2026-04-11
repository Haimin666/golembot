import type { ChannelAdapter, ChannelMessage, ImageAttachment, ReplyOptions } from '../channel.js';
import { importPeer } from '../peer-require.js';
import type { DingtalkChannelConfig } from '../workspace.js';

/** Generate a unique tracking ID for DingTalk streaming card updates. */
function generateOutTrackId(): string {
  return `golem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export class DingtalkAdapter implements ChannelAdapter {
  readonly name = 'dingtalk';
  readonly maxMessageLength = 4000;
  private config: DingtalkChannelConfig;
  private dwClient: any;

  /**
   * Content-level dedup: "senderId:text" → timestamp of last seen.
   *
   * DingTalk Stream SDK can redeliver the same message with a DIFFERENT
   * messageId (e.g., WebSocket reconnect, internal retry).
   *
   * Catches duplicates by content fingerprint:
   *   key   = `${senderId}::${text}` (same sender + same text = same message)
   *   value = timestamp when first seen
   *   TTL   = 60 seconds (enough to catch fast redeliveries, won't block legit repeats)
   */
  private recentContentDedup = new Map<string, number>();
  private static readonly CONTENT_DEDUP_TTL_MS = 60_000; // 60 seconds

  /** Active streaming card state: outTrackId → card info */
  private streamCards = new Map<
    string,
    {
      chatId: string;
      chatType: 'dm' | 'group';
      senderId?: string;
      webhook?: string;
      accumulatedThinking: string;
      accumulatedContent: string;
      /**
       * The lookup key used to route reply() calls to this card.
       * Uses msg.messageId when available (per-message isolation),
       * falls back to "chatId:senderId" session key for backward compat.
       */
      cardKey: string;
    }
  >();

  /**
   * cardKey → active card outTrackId mapping.
   *
   * IMPORTANT: The key is msg.messageId (per-message), NOT chatId:senderId (per-session).
   * This ensures that when two DIFFERENT messages arrive from the same user,
   * each message's reply() updates only its own streaming card.
   */
  private sessionActiveCards = new Map<string, string>();

  constructor(config: DingtalkChannelConfig) {
    this.config = config;
  }

  /**
   * Build a card routing key for the given message.
   * Uses messageId for per-message isolation when available.
   */
  private buildCardKey(msg: ChannelMessage): string {
    return msg.messageId || `${msg.chatId}:${msg.senderId}`;
  }

  /**
   * Check content-level dedup. Returns true if this is a likely duplicate.
   * Uses senderId + text as fingerprint with a 60-second TTL.
   */
  private isContentDuplicate(senderId: string, text: string): boolean {
    const key = `${senderId}::${text}`;
    const now = Date.now();
    const seenAt = this.recentContentDedup.get(key);
    if (seenAt !== undefined && now - seenAt < DingtalkAdapter.CONTENT_DEDUP_TTL_MS) {
      return true; // Duplicate within TTL window
    }
    this.recentContentDedup.set(key, now);
    // Purge expired entries periodically (keep map bounded)
    if (this.recentContentDedup.size > 200) {
      const cutoff = now - DingtalkAdapter.CONTENT_DEDUP_TTL_MS;
      for (const [k, ts] of this.recentContentDedup) {
        if (ts < cutoff) this.recentContentDedup.delete(k);
      }
    }
    return false;
  }

  /**
   * Download an image from DingTalk using the provided download code/URL.
   * Returns an ImageAttachment or undefined on failure.
   */
  private async downloadImage(picURL: string): Promise<ImageAttachment | undefined> {
    try {
      const accessToken = await this.dwClient?.getAccessToken?.();
      const headers: Record<string, string> = {};
      if (accessToken) headers['x-acs-dingtalk-access-token'] = accessToken;
      const resp = await fetch(picURL, { headers });
      if (resp.ok) {
        const buf = Buffer.from(await resp.arrayBuffer());
        const ct = resp.headers.get('content-type') || 'image/jpeg';
        return { mimeType: ct.split(';')[0], data: buf };
      }
    } catch (e) {
      console.error('[dingtalk] Failed to download image:', (e as Error).message);
    }
    return undefined;
  }

  async start(onMessage: (msg: ChannelMessage) => void): Promise<void> {
    let sdk: any;
    try {
      sdk = await importPeer('dingtalk-stream');
    } catch {
      throw new Error('DingTalk adapter requires dingtalk-stream. Install it: npm install dingtalk-stream');
    }

    const { DWClient, TOPIC_ROBOT } = sdk;

    this.dwClient = new DWClient({
      clientId: this.config.clientId,
      clientSecret: this.config.clientSecret,
    });

    this.dwClient.registerCallbackListener(TOPIC_ROBOT, async (res: any) => {
      const msgId: string | undefined = res.headers?.messageId || JSON.parse(res.data).msgId;

      const data = JSON.parse(res.data);
      const msgtype = data.msgtype;
      let text = '';
      const images: ImageAttachment[] = [];

      if (msgtype === 'text' || !msgtype) {
        text = data.text?.content?.trim() || '';
      } else if (msgtype === 'picture') {
        const picURL = data.content?.downloadCode || data.content?.picURL;
        if (picURL) {
          const img = await this.downloadImage(picURL);
          if (img) images.push(img);
        }
        text = '(image)';
      } else {
        this.dwClient.socketCallBackResponse(res.headers.messageId, { status: 'SUCCESS' });
        return;
      }

      if (!text && images.length === 0) return;

      const isGroup = data.conversationType === '2';
      const senderId = data.senderStaffId || data.senderId || '';

      // Content fingerprint dedup: same sender + same text within 60s = duplicate.
      if (text !== '(image)' && this.isContentDuplicate(senderId, text)) {
        console.log(
          `[dingtalk] content-dedup: skipping duplicate message from ${data.senderNick || senderId}: "${text.slice(0, 60)}..." (msgId=${msgId})`,
        );
        this.dwClient.socketCallBackResponse(res.headers.messageId, { status: 'SUCCESS' });
        return;
      }

      const channelMsg: ChannelMessage = {
        channelType: 'dingtalk',
        senderId,
        senderName: data.senderNick,
        chatId: data.conversationId || '',
        chatType: isGroup ? 'group' : 'dm',
        text,
        messageId: msgId,
        images: images.length > 0 ? images : undefined,
        mentioned: isGroup ? true : undefined,
        raw: { ...data, _sessionWebhook: data.sessionWebhook },
      };

      onMessage(channelMsg);

      this.dwClient.socketCallBackResponse(res.headers.messageId, { status: 'SUCCESS' });
    });

    await this.dwClient.connect();
    console.log(`[dingtalk] Stream connection established`);
  }

  async reply(msg: ChannelMessage, text: string, _options?: ReplyOptions): Promise<void> {
    const raw = msg.raw as { _sessionWebhook?: string; senderStaffId?: string };
    const webhook = raw?._sessionWebhook;

    // Use messageId-based cardKey for per-message card isolation.
    const cardKey = this.buildCardKey(msg);
    const activeCardId = this.sessionActiveCards.get(cardKey);

    if (activeCardId && this.streamCards.has(activeCardId)) {
      // Update the streaming card instead of sending a separate message
      await this.updateStreamingCardContent(activeCardId, text);
      return;
    }

    // No active card - send as regular message
    if (!webhook) return;

    const body = {
      msgtype: 'text',
      text: { content: text },
    };

    const accessToken = await this.dwClient?.getAccessToken?.();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (accessToken) {
      headers['x-acs-dingtalk-access-token'] = accessToken;
    }

    await fetch(webhook, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  }

  /**
   * Update the content of a streaming card.
   * Called by reply() when there's an active streaming card.
   * Gateway sends chunks (paragraphs), not accumulated content,
   * so we accumulate content here for the typewriter effect.
   */
  private async updateStreamingCardContent(outTrackId: string, text: string): Promise<void> {
    const accessToken = await this.dwClient?.getAccessToken?.();
    if (!accessToken) return;

    const cardInfo = this.streamCards.get(outTrackId);
    if (!cardInfo) return;

    cardInfo.accumulatedContent = (cardInfo.accumulatedContent || '') + text;

    const verbose = process.env.GOLEM_VERBOSE === '1' || process.env.GOLEMBOT_VERBOSE === '1';
    if (verbose) {
      console.log(
        `[dingtalk] updateStreamingCardContent: +${text.length} chars, total=${cardInfo.accumulatedContent.length} chars, preview="${text.slice(0, 50)}..."`,
      );
    }

    const requestBody = {
      outTrackId,
      guid: crypto.randomUUID(),
      key: 'content',
      content: cardInfo.accumulatedContent,
      isFull: true,
      isFinalize: true,
      isError: false,
    };

    try {
      const resp = await fetch('https://api.dingtalk.com/v1.0/card/streaming', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-acs-dingtalk-access-token': accessToken,
        },
        body: JSON.stringify(requestBody),
      });

      if (!resp.ok) {
        const errorText = await resp.text();
        console.warn(`[dingtalk] streaming card update failed (${resp.status}): ${errorText}`);
      } else if (verbose) {
        const result = await resp.text();
        console.log(`[dingtalk] streaming card update success: ${result.slice(0, 200)}`);
      }
    } catch (e) {
      console.error('[dingtalk] updateStreamingCardContent error:', (e as Error).message);
    }
  }

  // ── Streaming status support (interactive card with live updates) ──

  /**
   * Create a streaming status card using DingTalk's interactive card API.
   */
  async sendStatus(msg: ChannelMessage, text: string): Promise<string> {
    const outTrackId = generateOutTrackId();
    const accessToken = await this.dwClient?.getAccessToken?.();
    const webhook = (msg.raw as { _sessionWebhook?: string })?._sessionWebhook;

    const cardKey = this.buildCardKey(msg);

    this.streamCards.set(outTrackId, {
      chatId: msg.chatId,
      chatType: msg.chatType,
      senderId: msg.senderId,
      webhook: webhook || undefined,
      accumulatedThinking: '',
      accumulatedContent: '',
      cardKey,
    });

    this.sessionActiveCards.set(cardKey, outTrackId);

    if (!accessToken || !this.config.cardTemplateId) {
      console.warn(`[dingtalk] cardTemplateId not configured or no access token, falling back to webhook`);
      await this.sendFallbackMarkdown(webhook, accessToken, text);
      return outTrackId;
    }

    const isDM = msg.chatType === 'dm';
    const requestBody: Record<string, unknown> = {
      cardTemplateId: this.config.cardTemplateId,
      outTrackId,
      conversationType: isDM ? 0 : 1,
      cardData: {
        cardParamMap: {
          content: text || '⏳ Thinking...',
        },
      },
    };

    if (isDM) {
      requestBody.receiverUserIdList = [msg.senderId];
    } else {
      requestBody.openConversationId = msg.chatId;
    }

    try {
      const resp = await fetch('https://api.dingtalk.com/v1.0/im/interactiveCards/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-acs-dingtalk-access-token': accessToken,
        },
        body: JSON.stringify(requestBody),
      });

      if (resp.ok) {
        const result = await resp.json();
        console.log(
          `[dingtalk] interactive card created: ${outTrackId}, processQueryKey: ${result?.result?.processQueryKey || 'N/A'}`,
        );
        return outTrackId;
      }

      const errorText = await resp.text();
      console.warn(`[dingtalk] card send failed (${resp.status}): ${errorText}, falling back to webhook`);
    } catch (e) {
      console.error('[dingtalk] sendStatus card error:', (e as Error).message);
    }

    await this.sendFallbackMarkdown(webhook, accessToken, text);
    return outTrackId;
  }

  private async sendFallbackMarkdown(
    webhook: string | undefined,
    accessToken: string | undefined,
    text: string,
  ): Promise<void> {
    if (!webhook) return;

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (accessToken) {
      headers['x-acs-dingtalk-access-token'] = accessToken;
    }

    try {
      await fetch(webhook, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          msgtype: 'markdown',
          markdown: { title: '🤖 AI', text: text || '⏳ Thinking...' },
        }),
      });
    } catch {
      /* best effort */
    }
  }

  /**
   * Update an existing streaming card using DingTalk's streaming API.
   */
  async updateStatus(msg: ChannelMessage, statusId: string, text: string, thinking?: string): Promise<void> {
    const accessToken = await this.dwClient?.getAccessToken?.();
    if (!accessToken) return;

    const cardInfo = this.streamCards.get(statusId);
    if (!cardInfo) {
      console.warn(`[dingtalk] no card info found for statusId: ${statusId}`);
      return;
    }

    const verbose = process.env.GOLEM_VERBOSE === '1' || process.env.GOLEMBOT_VERBOSE === '1';

    const isFinalizeOnly = text === '✅ Done' || text.toLowerCase() === 'done';

    if (thinking !== undefined) {
      cardInfo.accumulatedThinking = thinking;
    }

    if (verbose) {
      console.log(
        `[dingtalk] updateStatus: text="${text.slice(0, 50)}...", thinking=${thinking?.length || 0} chars, accumulatedContent=${cardInfo.accumulatedContent.length} chars, isFinalizeOnly=${isFinalizeOnly}`,
      );
    }

    let content: string;
    if (isFinalizeOnly) {
      content = this.buildCombinedContent(cardInfo.accumulatedThinking, cardInfo.accumulatedContent);
      if (verbose) {
        console.log(
          `[dingtalk] finalize: combined content = ${content.length} chars (thinking: ${cardInfo.accumulatedThinking.length}, reply: ${cardInfo.accumulatedContent.length})`,
        );
      }
      // Clean up the card mapping for this specific message
      const currentActive = this.sessionActiveCards.get(cardInfo.cardKey);
      if (currentActive === statusId) {
        this.sessionActiveCards.delete(cardInfo.cardKey);
        if (verbose) {
          console.log(`[dingtalk] finalize: cleared card mapping for cardKey=${cardInfo.cardKey}`);
        }
      }
    } else {
      const displayText = cardInfo.accumulatedContent || text;
      content = this.buildCombinedContent(cardInfo.accumulatedThinking, displayText);
    }

    const requestBody: Record<string, unknown> = {
      outTrackId: statusId,
      guid: crypto.randomUUID(),
      key: 'content',
      content,
      isFull: true,
      isFinalize: true,
      isError: false,
    };

    try {
      const resp = await fetch('https://api.dingtalk.com/v1.0/card/streaming', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-acs-dingtalk-access-token': accessToken,
        },
        body: JSON.stringify(requestBody),
      });

      if (!resp.ok) {
        const errorText = await resp.text();
        console.warn(`[dingtalk] card streaming update failed (${resp.status}): ${errorText}`);
      } else if (verbose) {
        const result = await resp.text();
        console.log(`[dingtalk] card streaming update success: ${result.slice(0, 200)}`);
      }
    } catch (e) {
      console.error('[dingtalk] updateStatus error:', (e as Error).message);
    }
  }

  /**
   * Simplify Claude Code TUI output for better rendering in DingTalk cards.
   *
   * Claude Code's reply uses TUI (Terminal UI) formatting:
   *   - Unicode box-drawing tables: ┌─┬┐ │ ├┼┤ └┴┘
   *   - ANSI color/bold codes (stripped by stream-json)
   *   - Fenced code blocks (```...```)
   *   - Markdown headings, lists, inline code
   *
   * This transformer:
   *   1. Parses TUI Unicode tables → HTML tables (DingTalk cards don't render pipe tables)
   *   2. Strips code block fences
   *   3. Cleans up heading/list formatting
   */

  // ── TUI table detection & parsing ──

  /** Characters used in TUI box-drawing table borders */
  private static readonly TUI_BOX_CHARS = '┌┐└┘├┤┬┴┼─│═╔╗╚╝║╠╣╦╩╬';

  /** Separator char set: box-drawing chars minus │ (data pipe) */
  private static readonly TUI_SEPARATOR_CHARS = '┌┐└┘├┤┬┴┼─═╔╗╚╝║╠╣╦╩╬';

  /**
   * Classify a TUI table line.
   * Returns 'data' (has │ column separator), 'separator' (only box-drawing chars),
   * or null if not a TUI table line.
   */
  private classifyTUILine(line: string): 'data' | 'separator' | null {
    const trimmed = line.trim();
    if (!trimmed) return null;

    let boxCharCount = 0;
    let totalNonSpace = 0;
    let hasPipe = false;
    for (const ch of trimmed) {
      if (ch === ' ') continue;
      totalNonSpace++;
      if (DingtalkAdapter.TUI_BOX_CHARS.includes(ch)) {
        boxCharCount++;
        if (ch === '│') hasPipe = true;
      }
    }

    if (boxCharCount < 3) return null;
    if (hasPipe) return 'data';
    // Separator row: all non-space chars are box-drawing (excluding │)
    for (const ch of trimmed) {
      if (ch !== ' ' && !DingtalkAdapter.TUI_SEPARATOR_CHARS.includes(ch)) return null;
    }
    return 'separator';
  }

  /**
   * Extract cell contents from a TUI data row like:
   *   │ 423    │ 大数据   │ cc_user │ 3         │
   * Returns array of trimmed cell strings.
   */
  private parseTUIDataRow(line: string): string[] {
    return line
      .split('│')
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
  }

  /**
   * Find and convert TUI Unicode tables in the text to HTML tables.
   * Returns [modifiedText, foundAnyTable].
   */
  private convertTUITables(text: string): { text: string; converted: boolean } {
    const lines = text.split('\n');
    const result: string[] = [];
    let tableRows: string[][] = [];
    let inTable = false;
    let foundAny = false;
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      const classification = this.classifyTUILine(line);

      if (classification) {
        if (!inTable) {
          inTable = true;
          tableRows = [];
        }

        if (classification === 'separator') {
          i++;
          continue;
        }

        // Data row (header or body)
        const cells = this.parseTUIDataRow(line);
        if (cells.length > 0) {
          tableRows.push(cells);
        }
        i++;
      } else {
        // Non-table line — flush any accumulated table
        if (inTable && tableRows.length > 0) {
          const htmlTable = this.buildHTMLTable(tableRows);
          if (htmlTable) {
            result.push(htmlTable);
            foundAny = true;
          }
          tableRows = [];
          inTable = false;
        }
        result.push(line);
        i++;
      }
    }

    // Flush trailing table
    if (inTable && tableRows.length > 0) {
      const htmlTable = this.buildHTMLTable(tableRows);
      if (htmlTable) {
        result.push(htmlTable);
        foundAny = true;
      }
    }

    return { text: result.join('\n'), converted: foundAny };
  }

  /**
   * Build an HTML table from parsed TUI rows.
   * Uses HTML <table> because DingTalk card Markdown does NOT render
   * pipe tables (| col | col |) — they show as raw text.
   * HTML tables with inline CSS render properly in DingTalk cards.
   *
   * First row = header (bold, light background), rest = body.
   */
  private buildHTMLTable(rows: string[][]): string | null {
    if (rows.length === 0) return null;

    const numCols = Math.max(...rows.map((r) => r.length));
    if (numCols === 0) return null;

    // Pad all rows to the same column count
    const padded = rows.map((r) => {
      while (r.length < numCols) r.push('');
      return r;
    });

    const header = padded[0];
    const body = padded.slice(1);

    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const parts: string[] = [];
    parts.push(
      '<table border="1" cellpadding="6" cellspacing="0" ' +
        'style="border-collapse:collapse;border-color:#d0d0d0;width:100%;font-size:13px;">',
    );

    // Header row
    parts.push(
      '<tr style="background-color:#f5f5f5;font-weight:bold;">' +
        header.map((h) => `<td style="border:1px solid #d0d0d0;padding:6px 10px;">${esc(h)}</td>`).join('') +
        '</tr>',
    );

    // Body rows (alternating subtle background for readability)
    for (let i = 0; i < body.length; i++) {
      const row = body[i];
      const bg = i % 2 === 1 ? 'background-color:#fafafa;' : '';
      parts.push(
        `<tr style="${bg}">` +
          row.map((cell) => `<td style="border:1px solid #d0d0d0;padding:6px 10px;">${esc(cell)}</td>`).join('') +
          '</tr>',
      );
    }

    parts.push('</table>');
    return parts.join('');
  }

  // ── Main simplification entry point ──

  private simplifyMarkdownForCard(raw: string): string {
    let text = raw;

    // 1. Convert TUI Unicode tables to HTML tables
    const { text: afterTable } = this.convertTUITables(text);
    text = afterTable;

    // 2. Remove fenced code block markers (keep content)
    text = text.replace(/```[a-zA-Z]*\n?/g, '');
    text = text.replace(/```/g, '');

    // 3. Convert |command| style formatting to clean bullets
    text = text.replace(/^[\s]*\|([^|]+)\|\s+(.+)$/gm, '• `$1` $2');

    // 4. Convert ### headings to **bold** text
    text = text.replace(/^\s*#{1,4}\s+(.+)$/gm, '**$1**');

    // 5. Clean up excessive blank lines (max 1 consecutive)
    text = text.replace(/\n{3,}/g, '\n\n');

    // 6. Remove leading/trailing whitespace
    text = text.trim();

    return text;
  }

  private buildCombinedContent(thinking: string, text: string): string {
    const parts: string[] = [];
    if (thinking.trim()) {
      parts.push('💭 **思考过程:**\n' + thinking.trim());
    }
    if (text.trim()) {
      const displayText = this.simplifyMarkdownForCard(text);
      if (thinking.trim()) {
        parts.push('📝 **回复:**\n' + displayText);
      } else {
        parts.push(displayText);
      }
    }
    return parts.join('\n\n---\n\n');
  }

  async clearStatus(msg: ChannelMessage, statusId: string): Promise<void> {
    const cardInfo = this.streamCards.get(statusId);
    if (cardInfo) {
      const currentActive = this.sessionActiveCards.get(cardInfo.cardKey);
      if (currentActive === statusId) {
        this.sessionActiveCards.delete(cardInfo.cardKey);
      }
    }
    this.streamCards.delete(statusId);
  }

  async typing(_msg: ChannelMessage): Promise<void> {
    // DingTalk has no typing indicator; rely on streaming card for user feedback.
  }

  async send(chatId: string, text: string): Promise<void> {
    const accessToken = await this.dwClient?.getAccessToken?.();
    if (!accessToken) return;

    await fetch('https://api.dingtalk.com/v1.0/robot/groupMessages/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-acs-dingtalk-access-token': accessToken,
      },
      body: JSON.stringify({
        msgParam: JSON.stringify({ content: text }),
        msgKey: 'sampleText',
        openConversationId: chatId,
      }),
    });
  }

  async stop(): Promise<void> {
    this.dwClient = null;
    this.streamCards.clear();
    this.sessionActiveCards.clear();
    this.recentContentDedup.clear();
  }
}
