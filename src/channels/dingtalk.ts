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
  private seenMsgIds = new Set<string>();
  private static readonly MAX_SEEN = 500;

  /** Active streaming card state: outTrackId → { chatId, webhook } */
  private streamCards = new Map<string, { chatId: string; webhook?: string }>();

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

  // ── Streaming status support (interactive card with live updates) ──

  /**
   * Create a streaming status card via the DingTalk robot send API.
   * Uses `sampleFreeCard` with an `outTrackId` so the card can be updated
   * in-place via `PATCH /v1.0/card/instances`.
   *
   * Falls back to a markdown message via session webhook if the card API fails.
   */
  async sendStatus(msg: ChannelMessage, text: string): Promise<string> {
    const outTrackId = generateOutTrackId();
    const accessToken = await this.dwClient?.getAccessToken?.();
    const webhook = (msg.raw as { _sessionWebhook?: string })?._sessionWebhook;

    this.streamCards.set(outTrackId, { chatId: msg.chatId, webhook: webhook || undefined });

    if (!accessToken) return outTrackId;

    // Build the interactive card payload
    const cardParam = JSON.stringify({
      config: { wideScreenMode: true },
      header: {
        title: { tag: 'plain_text', content: '🤖 AI Assistant' },
        template: 'grey',
      },
      elements: [{ tag: 'markdown', content: text || '⏳ Thinking...' }],
    });

    try {
      const resp = await fetch('https://api.dingtalk.com/v1.0/robot/groupMessages/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-acs-dingtalk-access-token': accessToken,
        },
        body: JSON.stringify({
          openConversationId: msg.chatId,
          msgKey: 'sampleFreeCard',
          outTrackId,
          msgParam: cardParam,
        }),
      });

      if (resp.ok) {
        console.log(`[dingtalk] streaming card created: ${outTrackId}`);
        return outTrackId;
      }

      // Card send failed — fall back to webhook markdown
      console.warn(`[dingtalk] card send failed (${resp.status}), falling back to webhook`);
    } catch (e) {
      console.error('[dingtalk] sendStatus card error:', (e as Error).message);
    }

    // Fallback: send as markdown via session webhook
    if (webhook) {
      try {
        await fetch(webhook, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-acs-dingtalk-access-token': accessToken,
          },
          body: JSON.stringify({
            msgtype: 'markdown',
            markdown: { title: '🤖 AI', text: text || '⏳ Thinking...' },
          }),
        });
      } catch {
        /* best effort */
      }
    }

    return outTrackId;
  }

  /**
   * Update an existing streaming card in-place via the card instances API.
   * Uses the `outTrackId` from `sendStatus()` to identify the card.
   */
  async updateStatus(msg: ChannelMessage, statusId: string, text: string): Promise<void> {
    const accessToken = await this.dwClient?.getAccessToken?.();
    if (!accessToken) return;

    const cardInfo = this.streamCards.get(statusId);
    if (!cardInfo) return;

    const cardData = {
      config: { wideScreenMode: true },
      header: {
        title: { tag: 'plain_text', content: '🤖 AI Assistant' },
        template: 'grey',
      },
      elements: [{ tag: 'markdown', content: text }],
    };

    try {
      const resp = await fetch('https://api.dingtalk.com/v1.0/card/instances', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-acs-dingtalk-access-token': accessToken,
        },
        body: JSON.stringify({
          outTrackId: statusId,
          cardData,
        }),
      });

      if (!resp.ok) {
        console.warn(`[dingtalk] card update failed (${resp.status})`);
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
