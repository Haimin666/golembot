import { randomUUID } from 'node:crypto';
import type { ChannelAdapter, ChannelMessage, ReplyOptions } from '../channel.js';
import type { WeixinChannelConfig } from '../workspace.js';

/**
 * WeChat (个人微信) adapter using Tencent iLink Bot API.
 * Pure HTTP long-polling — no external SDK dependency.
 */
export class WeixinAdapter implements ChannelAdapter {
  readonly name = 'weixin';
  readonly maxMessageLength = 2000;

  private config: WeixinChannelConfig;
  private baseUrl: string;
  private seenMsgIds = new Set<string>();
  private static readonly MAX_SEEN = 500;
  private contextTokens = new Map<string, string>();
  private syncBuffer = '';
  private running = false;
  private pollAbortController: AbortController | null = null;

  constructor(config: WeixinChannelConfig) {
    this.config = config;
    this.baseUrl = (config.baseUrl || 'https://ilinkai.weixin.qq.com').replace(/\/$/, '');
  }

  async start(onMessage: (msg: ChannelMessage) => void): Promise<void> {
    if (!this.config.token) {
      throw new Error('WeChat adapter requires a token. Obtain one via iLink Bot QR login and add it to golem.yaml.');
    }
    this.running = true;
    this.pollLoop(onMessage).catch((e) => {
      console.error('[weixin] Poll loop crashed:', (e as Error).message);
    });
    console.log('[weixin] adapter started, polling...');
  }

  async reply(msg: ChannelMessage, text: string, _options?: ReplyOptions): Promise<void> {
    const raw = msg.raw as Record<string, unknown> | undefined;
    const contextToken = (raw?.context_token as string) || this.contextTokens.get(msg.senderId);
    if (!contextToken) {
      console.error(`[weixin] Cannot reply to ${msg.senderId}: no context_token available`);
      return;
    }

    const body = {
      msg: {
        from_user_id: '',
        to_user_id: msg.senderId,
        client_id: randomUUID(),
        message_type: 2,
        message_state: 2,
        context_token: contextToken,
        item_list: [{ type: 1, text_item: { text } }],
      },
      base_info: { channel_version: '0.1.0' },
    };

    const resp = await fetch(`${this.baseUrl}/ilink/bot/sendmessage`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      console.error(`[weixin] sendmessage failed: HTTP ${resp.status}`);
    }
  }

  async stop(): Promise<void> {
    this.running = false;
    this.pollAbortController?.abort();
    this.pollAbortController = null;
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      AuthorizationType: 'ilink_bot_token',
      Authorization: `Bearer ${this.config.token}`,
      'X-WECHAT-UIN': String(Math.floor(Math.random() * 1_000_000_000)),
    };
  }

  private async pollLoop(onMessage: (msg: ChannelMessage) => void): Promise<void> {
    const BASE_DELAY = 1000;
    const MAX_DELAY = 30_000;
    let consecutiveErrors = 0;

    while (this.running) {
      try {
        this.pollAbortController = new AbortController();
        const resp = await fetch(`${this.baseUrl}/ilink/bot/getupdates`, {
          method: 'POST',
          headers: this.headers(),
          body: JSON.stringify({
            get_updates_buf: this.syncBuffer,
            base_info: { channel_version: '0.1.0' },
          }),
          signal: this.pollAbortController.signal,
        });

        if (!resp.ok) {
          if (resp.status === 401) {
            console.error('[weixin] Token expired or invalid. Re-authenticate with iLink Bot QR login.');
            this.running = false;
            return;
          }
          throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
        }

        const data = (await resp.json()) as {
          ret?: number;
          msgs?: unknown[];
          get_updates_buf?: string;
        };

        if (data.get_updates_buf) {
          this.syncBuffer = data.get_updates_buf;
        }

        consecutiveErrors = 0;

        const msgs = data.msgs || [];
        for (const update of msgs) {
          const parsed = this.parseMessage(update);
          if (!parsed) continue;

          // Dedup
          const dedupKey = parsed.messageId || `${parsed.senderId}:${Date.now()}`;
          if (this.seenMsgIds.has(dedupKey)) continue;
          this.seenMsgIds.add(dedupKey);
          if (this.seenMsgIds.size > WeixinAdapter.MAX_SEEN) {
            const entries = [...this.seenMsgIds];
            this.seenMsgIds = new Set(entries.slice(entries.length >> 1));
          }

          // Store context_token for this sender
          const raw = update as Record<string, unknown>;
          if (raw.context_token) {
            this.contextTokens.set(parsed.senderId, raw.context_token as string);
          }

          try {
            await onMessage(parsed);
          } catch (e) {
            console.error('[weixin] onMessage error:', (e as Error).message);
          }
        }
      } catch (e) {
        if ((e as Error).name === 'AbortError') break;
        consecutiveErrors++;
        const delay = Math.min(BASE_DELAY * 2 ** (consecutiveErrors - 1), MAX_DELAY);
        console.error(
          `[weixin] Poll error (attempt ${consecutiveErrors}): ${(e as Error).message}. Retrying in ${delay}ms`,
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  private parseMessage(update: unknown): ChannelMessage | null {
    const raw = update as Record<string, unknown>;

    // Only process user messages (message_type 1); skip bot messages (2+)
    if (raw.message_type !== undefined && raw.message_type !== 1) return null;

    const senderId = (raw.from_user_id as string) || '';
    if (!senderId) return null;

    const messageId = (raw.client_id as string) || '';
    const itemList = (raw.item_list as Array<Record<string, unknown>>) || [];

    // Extract text from item_list
    let text = '';
    for (const item of itemList) {
      switch (item.type) {
        case 1: {
          const textItem = item.text_item as Record<string, unknown> | undefined;
          text += (textItem?.text as string) || '';
          break;
        }
        case 2:
          text += '(image)';
          break;
        case 3: {
          const voiceItem = item.voice_item as Record<string, unknown> | undefined;
          text += (voiceItem?.text as string) || '(voice)';
          break;
        }
        case 4: {
          const fileItem = item.file_item as Record<string, unknown> | undefined;
          const fileName = (fileItem?.file_url as string) || '';
          text += fileName ? `(file: ${fileName})` : '(file)';
          break;
        }
        case 5:
          text += '(video)';
          break;
        default:
          break;
      }
    }

    if (!text) return null;

    return {
      channelType: 'weixin',
      senderId,
      chatId: senderId,
      chatType: 'dm',
      text,
      messageId,
      raw: update,
    };
  }
}
