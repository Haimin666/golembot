import type { ChannelAdapter, ChannelMessage } from '../channel.js';
import type { FeishuChannelConfig } from '../workspace.js';

export class FeishuAdapter implements ChannelAdapter {
  readonly name = 'feishu';
  private config: FeishuChannelConfig;
  private client: any;
  private wsClient: any;

  constructor(config: FeishuChannelConfig) {
    this.config = config;
  }

  async start(onMessage: (msg: ChannelMessage) => void): Promise<void> {
    let lark: any;
    try {
      lark = await import('@larksuiteoapi/node-sdk');
    } catch {
      throw new Error(
        'Feishu adapter requires @larksuiteoapi/node-sdk. Install it: npm install @larksuiteoapi/node-sdk',
      );
    }

    const baseConfig = {
      appId: this.config.appId,
      appSecret: this.config.appSecret,
    };

    this.client = new lark.Client(baseConfig);

    const eventDispatcher = new lark.EventDispatcher({}).register({
      'im.message.receive_v1': async (data: any) => {
        const { message, sender } = data;

        if (message.message_type !== 'text') return;

        let text = '';
        try {
          text = JSON.parse(message.content).text;
        } catch {
          return;
        }

        const chatType: 'dm' | 'group' = message.chat_type === 'p2p' ? 'dm' : 'group';

        const channelMsg: ChannelMessage = {
          channelType: 'feishu',
          senderId: sender.sender_id?.open_id || sender.sender_id?.user_id || '',
          senderName: sender.sender_id?.open_id,
          chatId: message.chat_id,
          chatType,
          text,
          raw: data,
        };

        onMessage(channelMsg);
      },
    });

    this.wsClient = new lark.WSClient({
      ...baseConfig,
      loggerLevel: lark.LoggerLevel.info,
    });

    await this.wsClient.start({ eventDispatcher });
    console.log(`[feishu] WebSocket connection established`);
  }

  async reply(msg: ChannelMessage, text: string): Promise<void> {
    if (!this.client) return;
    await this.client.im.v1.message.create({
      params: { receive_id_type: 'chat_id' },
      data: {
        receive_id: msg.chatId,
        content: JSON.stringify({ text }),
        msg_type: 'text',
      },
    });
  }

  async stop(): Promise<void> {
    // WSClient doesn't expose a clean close method in current SDK version;
    // setting to null allows GC to collect.
    this.wsClient = null;
    this.client = null;
  }
}
