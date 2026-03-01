export interface ChannelMessage {
  channelType: string;
  senderId: string;
  senderName?: string;
  chatId: string;
  chatType: 'dm' | 'group';
  text: string;
  raw: unknown;
}

export interface ChannelAdapter {
  readonly name: string;
  start(onMessage: (msg: ChannelMessage) => void): Promise<void>;
  reply(msg: ChannelMessage, text: string): Promise<void>;
  stop(): Promise<void>;
}

export function buildSessionKey(msg: ChannelMessage): string {
  return `${msg.channelType}:${msg.chatId}:${msg.senderId}`;
}

/**
 * Strip @mention tags from the text, returning only the user's actual message.
 * Handles common IM @mention formats: `@BotName`, `<at user_id="xxx">BotName</at>` etc.
 */
export function stripMention(text: string): string {
  return text
    .replace(/<at[^>]*>.*?<\/at>/gi, '')
    .replace(/@\S+/g, '')
    .trim();
}
