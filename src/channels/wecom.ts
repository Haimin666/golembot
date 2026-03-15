import type { ChannelAdapter, ChannelMessage, ReplyOptions } from '../channel.js';
import { importPeer } from '../peer-require.js';
import type { WecomChannelConfig } from '../workspace.js';

export class WecomAdapter implements ChannelAdapter {
  readonly name = 'wecom';
  readonly maxMessageLength = 2048;
  private config: WecomChannelConfig;
  private wsClient: any = null;
  private seenMsgIds = new Set<string>();
  private static readonly MAX_SEEN = 500;

  constructor(config: WecomChannelConfig) {
    this.config = config;
  }

  async start(onMessage: (msg: ChannelMessage) => void): Promise<void> {
    let AiBot: any;
    try {
      AiBot = await importPeer('@wecom/aibot-node-sdk');
    } catch {
      throw new Error('WeCom adapter requires @wecom/aibot-node-sdk. Install it: npm install @wecom/aibot-node-sdk');
    }

    // Support both default and named exports
    const WSClient = AiBot.WSClient || AiBot.default?.WSClient || AiBot.default;
    if (!WSClient) {
      throw new Error('Invalid @wecom/aibot-node-sdk: WSClient not found');
    }

    const wsOpts: Record<string, unknown> = {
      botId: this.config.botId,
      secret: this.config.secret,
    };
    if (this.config.websocketUrl) wsOpts.url = this.config.websocketUrl;

    this.wsClient = new WSClient(wsOpts);

    this.wsClient.on('message.text', (frame: any) => {
      this.handleFrame(frame, onMessage);
    });

    this.wsClient.on('message.image', (frame: any) => {
      this.handleFrame(frame, onMessage, '(image)');
    });

    await this.wsClient.connect();
    console.log('[wecom] WebSocket connection established');
  }

  private handleFrame(frame: any, onMessage: (msg: ChannelMessage) => void, fallbackText?: string): void {
    const msgId: string | undefined = frame.msgId || frame.message_id;
    if (msgId) {
      if (this.seenMsgIds.has(msgId)) return;
      this.seenMsgIds.add(msgId);
      if (this.seenMsgIds.size > WecomAdapter.MAX_SEEN) {
        const entries = [...this.seenMsgIds];
        this.seenMsgIds = new Set(entries.slice(entries.length >> 1));
      }
    }

    const text = frame.content?.text || frame.text || fallbackText || '';
    if (!text) return;

    const isGroup = frame.chatType === 'group' || frame.chat_type === 'group';

    const channelMsg: ChannelMessage = {
      channelType: 'wecom',
      senderId: frame.userId || frame.from || '',
      senderName: frame.userName || frame.from_name,
      chatId: frame.chatId || frame.conversation_id || '',
      chatType: isGroup ? 'group' : 'dm',
      text,
      messageId: msgId,
      mentioned: frame.mentioned,
      raw: frame,
    };

    onMessage(channelMsg);
  }

  async reply(msg: ChannelMessage, text: string, _options?: ReplyOptions): Promise<void> {
    if (!this.wsClient) return;
    const frame = msg.raw;
    const streamId = `reply-${Date.now()}`;
    await this.wsClient.replyStream(frame, streamId, text, true);
  }

  async send(chatId: string, text: string): Promise<void> {
    if (!this.wsClient) return;
    await this.wsClient.sendMessage(chatId, { msgtype: 'text', text: { content: text } });
  }

  async stop(): Promise<void> {
    if (this.wsClient) {
      await this.wsClient.disconnect?.();
      this.wsClient = null;
    }
  }
}
