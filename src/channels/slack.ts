import type { ChannelAdapter, ChannelMessage } from '../channel.js';
import type { SlackChannelConfig } from '../workspace.js';

export class SlackAdapter implements ChannelAdapter {
  readonly name = 'slack';
  private config: SlackChannelConfig;
  private app: any;

  constructor(config: SlackChannelConfig) {
    this.config = config;
  }

  async start(onMessage: (msg: ChannelMessage) => void): Promise<void> {
    let boltModule: any;
    try {
      boltModule = await import('@slack/bolt');
    } catch {
      throw new Error(
        'Slack adapter requires @slack/bolt. Install it: npm install @slack/bolt',
      );
    }

    const { App } = boltModule;
    this.app = new App({
      token: this.config.botToken,
      appToken: this.config.appToken,
      socketMode: true,
    });

    // Handle DM messages (channel_type === 'im')
    this.app.message(async ({ message }: any) => {
      if (message.subtype) return; // ignore edits, bot messages, etc.
      if (message.channel_type !== 'im') return; // group messages handled via app_mention
      if (!message.text) return;

      onMessage({
        channelType: 'slack',
        senderId: message.user,
        chatId: message.channel,
        chatType: 'dm',
        text: message.text,
        raw: message,
      });
    });

    // Handle group @mention events
    this.app.event('app_mention', async ({ event }: any) => {
      if (!event.text) return;
      // Strip <@BOT_ID> prefix(es)
      const text = event.text.replace(/<@[A-Z0-9]+>/g, '').trim();
      if (!text) return;

      onMessage({
        channelType: 'slack',
        senderId: event.user,
        chatId: event.channel,
        chatType: 'group',
        text,
        raw: event,
      });
    });

    await this.app.start();
    console.log(`[slack] Socket Mode connection established`);
  }

  async reply(msg: ChannelMessage, text: string): Promise<void> {
    if (!this.app) return;
    await this.app.client.chat.postMessage({
      channel: msg.chatId,
      text,
    });
  }

  async stop(): Promise<void> {
    if (this.app) {
      await this.app.stop();
      this.app = null;
    }
  }
}
