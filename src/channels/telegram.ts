import type { ChannelAdapter, ChannelMessage } from '../channel.js';
import type { TelegramChannelConfig } from '../workspace.js';

export class TelegramAdapter implements ChannelAdapter {
  readonly name = 'telegram';
  private config: TelegramChannelConfig;
  private bot: any;
  private botUsername: string | undefined;

  constructor(config: TelegramChannelConfig) {
    this.config = config;
  }

  async start(onMessage: (msg: ChannelMessage) => void): Promise<void> {
    let grammyModule: any;
    try {
      grammyModule = await import('grammy');
    } catch {
      throw new Error(
        'Telegram adapter requires grammy. Install it: npm install grammy',
      );
    }

    const { Bot } = grammyModule;
    this.bot = new Bot(this.config.botToken);

    // Fetch bot username for group mention detection
    const me = await this.bot.api.getMe();
    this.botUsername = me.username;

    this.bot.on('message:text', async (ctx: any) => {
      const message = ctx.message;
      const chatType: 'dm' | 'group' =
        message.chat.type === 'private' ? 'dm' : 'group';
      let text: string = message.text;

      if (chatType === 'group') {
        // Only respond when the bot is explicitly @mentioned
        const botUsername = this.botUsername;
        const isMentioned = (message.entities ?? []).some(
          (e: any) =>
            e.type === 'mention' &&
            text.slice(e.offset, e.offset + e.length) === `@${botUsername}`,
        );
        if (!isMentioned) return;
        // Strip bot @mention from text
        text = text.replace(new RegExp(`@${botUsername}`, 'g'), '').trim();
        if (!text) return;
      }

      onMessage({
        channelType: 'telegram',
        senderId: String(message.from?.id ?? message.chat.id),
        senderName: message.from?.first_name,
        chatId: String(message.chat.id),
        chatType,
        text,
        raw: message,
      });
    });

    // Start long-polling (non-blocking)
    this.bot.start().catch(() => {});
    console.log(`[telegram] Long-polling started (@${this.botUsername})`);
  }

  async reply(msg: ChannelMessage, text: string): Promise<void> {
    if (!this.bot) return;
    await this.bot.api.sendMessage(Number(msg.chatId), text);
  }

  async stop(): Promise<void> {
    if (this.bot) {
      await this.bot.stop();
      this.bot = null;
    }
  }
}
