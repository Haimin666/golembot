import type { ChannelAdapter, ChannelMessage, ImageAttachment, ReplyOptions } from '../channel.js';
import { importPeer } from '../peer-require.js';
import type { DingtalkChannelConfig } from '../workspace.js';

/** Generate a unique tracking ID for DingTalk streaming card updates. */
function generateOutTrackId(): string {
  return `golem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Generate a UUID v4 for idempotency keys. */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export class DingtalkAdapter implements ChannelAdapter {
  readonly name = 'dingtalk';
  readonly maxMessageLength = 4000;
  private config: DingtalkChannelConfig;
  private dwClient: any;
  private seenMsgIds = new Set<string>();
  private static readonly MAX_SEEN = 500;

  /** Active streaming card state: outTrackId → { chatId, chatType, senderId, webhook, accumulatedContent } */
  private streamCards = new Map<
    string,
    { chatId: string; chatType: 'dm' | 'group'; senderId?: string; webhook?: string; accumulatedContent: string }
  >();

  /** Session → active card tracking for streaming updates.
   * Maps sessionKey (chatId:senderId) to the current streaming card's outTrackId.
   * This allows reply() to update the card instead of sending separate messages. */
  private sessionActiveCards = new Map<string, string>();

  constructor(config: DingtalkChannelConfig) {
    this.config = config;
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
      // Deduplicate re-delivered events.
      const msgId: string | undefined = res.headers?.messageId || JSON.parse(res.data).msgId;
      if (msgId) {
        if (this.seenMsgIds.has(msgId)) {
          this.dwClient.socketCallBackResponse(res.headers.messageId, { status: 'SUCCESS' });
          return;
        }
        this.seenMsgIds.add(msgId);
        if (this.seenMsgIds.size > DingtalkAdapter.MAX_SEEN) {
          const entries = [...this.seenMsgIds];
          this.seenMsgIds = new Set(entries.slice(entries.length >> 1));
        }
      }

      const data = JSON.parse(res.data);
      const msgtype = data.msgtype;
      let text = '';
      const images: ImageAttachment[] = [];

      if (msgtype === 'text' || !msgtype) {
        text = data.text?.content?.trim() || '';
      } else if (msgtype === 'picture') {
        // DingTalk picture messages include a download URL
        const picURL = data.content?.downloadCode || data.content?.picURL;
        if (picURL) {
          try {
            const accessToken = await this.dwClient?.getAccessToken?.();
            const headers: Record<string, string> = {};
            if (accessToken) headers['x-acs-dingtalk-access-token'] = accessToken;
            const resp = await fetch(picURL, { headers });
            if (resp.ok) {
              const buf = Buffer.from(await resp.arrayBuffer());
              const ct = resp.headers.get('content-type') || 'image/jpeg';
              images.push({ mimeType: ct.split(';')[0], data: buf });
            }
          } catch (e) {
            console.error('[dingtalk] Failed to download image:', (e as Error).message);
          }
        }
        text = '(image)';
      } else if (msgtype === 'richText') {
        // Rich text may contain text + images
        const richText = data.content?.richText;
        if (Array.isArray(richText)) {
          for (const section of richText) {
            if (section.text) text += section.text;
            if (section.downloadCode || section.picURL) {
              const picURL = section.downloadCode || section.picURL;
              try {
                const accessToken = await this.dwClient?.getAccessToken?.();
                const headers: Record<string, string> = {};
                if (accessToken) headers['x-acs-dingtalk-access-token'] = accessToken;
                const resp = await fetch(picURL, { headers });
                if (resp.ok) {
                  const buf = Buffer.from(await resp.arrayBuffer());
                  const ct = resp.headers.get('content-type') || 'image/jpeg';
                  images.push({ mimeType: ct.split(';')[0], data: buf });
                }
              } catch (e) {
                console.error('[dingtalk] Failed to download rich text image:', (e as Error).message);
              }
            }
          }
          text = text.trim();
          if (!text && images.length > 0) text = '(image)';
        }
      } else {
        // Unsupported message type — skip
        this.dwClient.socketCallBackResponse(res.headers.messageId, { status: 'SUCCESS' });
        return;
      }

      if (!text && images.length === 0) return;

      const isGroup = data.conversationType === '2';

      const channelMsg: ChannelMessage = {
        channelType: 'dingtalk',
        senderId: data.senderStaffId || data.senderId || '',
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

    // Check if there's an active streaming card for this session
    const sessionKey = `${msg.chatId}:${msg.senderId}`;
    const activeCardId = this.sessionActiveCards.get(sessionKey);

    if (activeCardId && this.streamCards.has(activeCardId)) {
      // Update the streaming card instead of sending a separate message
      // This enables the typewriter effect for streaming replies
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
   * This is called by reply() when there's an active streaming card.
   *
   * IMPORTANT: Gateway sends chunks (paragraphs), not accumulated content.
   * We need to accumulate content ourselves for the typewriter effect.
   */
  private async updateStreamingCardContent(outTrackId: string, text: string): Promise<void> {
    const accessToken = await this.dwClient?.getAccessToken?.();
    if (!accessToken) return;

    const cardInfo = this.streamCards.get(outTrackId);
    if (!cardInfo) return;

    // Accumulate content (Gateway sends chunks, not full content)
    cardInfo.accumulatedContent = (cardInfo.accumulatedContent || '') + text;

    const requestBody = {
      outTrackId,
      guid: generateUUID(),
      key: 'content',
      content: cardInfo.accumulatedContent,
      isFull: true,
      isFinalize: false,
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
      }
    } catch (e) {
      console.error('[dingtalk] updateStreamingCardContent error:', (e as Error).message);
    }
  }

  // ── Streaming status support (interactive card with live updates) ──

  /**
   * Create a streaming status card using DingTalk's interactive card API.
   * Uses `/v1.0/im/interactiveCards/send` with a pre-configured card template.
   *
   * For DMs: Uses conversationType=0 and receiverUserIdList
   * For Groups: Uses conversationType=1 and openConversationId
   */
  async sendStatus(msg: ChannelMessage, text: string): Promise<string> {
    const outTrackId = generateOutTrackId();
    const accessToken = await this.dwClient?.getAccessToken?.();
    const webhook = (msg.raw as { _sessionWebhook?: string })?._sessionWebhook;

    // Store card state for later updates
    this.streamCards.set(outTrackId, {
      chatId: msg.chatId,
      chatType: msg.chatType,
      senderId: msg.senderId,
      webhook: webhook || undefined,
      accumulatedContent: '', // Initialize empty for streaming accumulation
    });

    // Register as active card for this session (for streaming reply updates)
    const sessionKey = `${msg.chatId}:${msg.senderId}`;
    this.sessionActiveCards.set(sessionKey, outTrackId);

    if (!accessToken || !this.config.cardTemplateId) {
      // No template configured or no token - fallback to webhook markdown
      console.warn(`[dingtalk] cardTemplateId not configured or no access token, falling back to webhook`);
      await this.sendFallbackMarkdown(webhook, accessToken, text);
      return outTrackId;
    }

    // Build the interactive card request
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

    // DM requires receiverUserIdList; Group requires openConversationId
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

      // Card send failed — log and fall back to webhook
      const errorText = await resp.text();
      console.warn(`[dingtalk] card send failed (${resp.status}): ${errorText}, falling back to webhook`);
    } catch (e) {
      console.error('[dingtalk] sendStatus card error:', (e as Error).message);
    }

    // Fallback: send as markdown via session webhook
    await this.sendFallbackMarkdown(webhook, accessToken, text);
    return outTrackId;
  }

  /**
   * Send a fallback markdown message via session webhook.
   */
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
   * Uses `PUT /v1.0/card/streaming` for typewriter effect.
   *
   * The content variable key must match what's defined in the card template.
   * We use 'content' as the default key.
   *
   * Special handling: When text is "✅ Done" (finalize signal from gateway),
   * we use the accumulated content and set isFinalize=true to mark completion.
   * This preserves the actual AI response that was already streamed.
   */
  async updateStatus(msg: ChannelMessage, statusId: string, text: string): Promise<void> {
    const accessToken = await this.dwClient?.getAccessToken?.();
    if (!accessToken) return;

    const cardInfo = this.streamCards.get(statusId);
    if (!cardInfo) {
      console.warn(`[dingtalk] no card info found for statusId: ${statusId}`);
      return;
    }

    // Check if this is a finalize-only update (gateway signals completion)
    // In this case, we use the accumulated content and set isFinalize=true
    const isFinalizeOnly = text === '✅ Done' || text.toLowerCase() === 'done';

    // Use the accumulated content from streaming updates
    const content = cardInfo.accumulatedContent || text;

    // Build streaming update request
    // Note: For markdown content, isFull must be true
    const requestBody: Record<string, unknown> = {
      outTrackId: statusId,
      guid: generateUUID(),
      key: 'content', // Must match the variable name in the card template
      content,
      isFull: true, // Required for markdown content
      isFinalize: true, // Always finalize on updateStatus call from gateway
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
      }
    } catch (e) {
      console.error('[dingtalk] updateStatus error:', (e as Error).message);
    }
  }

  /**
   * Clean up a streaming card's tracking state.
   * The card itself remains visible in the chat with its final content.
   */
  async clearStatus(msg: ChannelMessage, statusId: string): Promise<void> {
    // Also clean up the session → card mapping
    const cardInfo = this.streamCards.get(statusId);
    if (cardInfo) {
      const sessionKey = `${cardInfo.chatId}:${cardInfo.senderId}`;
      const currentActive = this.sessionActiveCards.get(sessionKey);
      // Only clear if it's the same card (don't clear if a new card was created)
      if (currentActive === statusId) {
        this.sessionActiveCards.delete(sessionKey);
      }
    }
    this.streamCards.delete(statusId);
  }

  /** DingTalk does not support a typing indicator API — no-op. */
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
  }
}
