import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChannelMessage } from '../channel.js';

// Mock @wecom/aibot-node-sdk
const mockConnect = vi.fn().mockResolvedValue(undefined);
const mockDisconnect = vi.fn().mockResolvedValue(undefined);
const mockReplyStream = vi.fn().mockResolvedValue(undefined);
const mockSendMessage = vi.fn().mockResolvedValue(undefined);
// biome-ignore lint/complexity/noBannedTypes: mock handler map for test
const handlers = new Map<string, Function>();
const constructorArgs: any[] = [];

class MockWSClient {
  constructor(opts: any) {
    constructorArgs.push(opts);
  }
  connect = mockConnect;
  disconnect = mockDisconnect;
  replyStream = mockReplyStream;
  sendMessage = mockSendMessage;
  // biome-ignore lint/complexity/noBannedTypes: mock
  on(event: string, handler: Function) {
    handlers.set(event, handler);
  }
}

vi.mock('../peer-require.js', () => ({
  importPeer: vi.fn().mockResolvedValue({
    WSClient: MockWSClient,
  }),
}));

// Must import after mock
const { WecomAdapter } = await import('../channels/wecom.js');

describe('WecomAdapter', () => {
  let adapter: InstanceType<typeof WecomAdapter>;
  let onMessage: (msg: ChannelMessage) => void;
  let onMessageMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    handlers.clear();
    constructorArgs.length = 0;
    adapter = new WecomAdapter({ botId: 'bot-123', secret: 'secret-456' });
    onMessageMock = vi.fn();
    onMessage = onMessageMock as unknown as (msg: ChannelMessage) => void;
    await adapter.start(onMessage);
  });

  afterEach(async () => {
    await adapter.stop();
  });

  describe('start', () => {
    it('creates WSClient with correct config', () => {
      expect(constructorArgs).toHaveLength(1);
      expect(constructorArgs[0]).toEqual({
        botId: 'bot-123',
        secret: 'secret-456',
      });
    });

    it('passes websocketUrl when configured', async () => {
      constructorArgs.length = 0;
      handlers.clear();
      const adapter2 = new WecomAdapter({
        botId: 'bot-789',
        secret: 'secret',
        websocketUrl: 'wss://custom.example.com',
      });
      await adapter2.start(() => {});
      expect(constructorArgs).toHaveLength(1);
      expect(constructorArgs[0]).toEqual({
        botId: 'bot-789',
        secret: 'secret',
        url: 'wss://custom.example.com',
      });
      await adapter2.stop();
    });

    it('registers message.text and message.image handlers', () => {
      expect(handlers.has('message.text')).toBe(true);
      expect(handlers.has('message.image')).toBe(true);
    });

    it('calls wsClient.connect()', () => {
      expect(mockConnect).toHaveBeenCalledOnce();
    });
  });

  describe('message handling', () => {
    it('emits channel message on text frame', () => {
      const textHandler = handlers.get('message.text')!;
      textHandler({
        msgId: 'msg-1',
        userId: 'user-1',
        userName: 'Alice',
        chatId: 'chat-1',
        chatType: 'dm',
        content: { text: 'Hello bot' },
      });

      expect(onMessageMock).toHaveBeenCalledOnce();
      const msg: ChannelMessage = onMessageMock.mock.calls[0][0];
      expect(msg.channelType).toBe('wecom');
      expect(msg.senderId).toBe('user-1');
      expect(msg.senderName).toBe('Alice');
      expect(msg.chatId).toBe('chat-1');
      expect(msg.chatType).toBe('dm');
      expect(msg.text).toBe('Hello bot');
      expect(msg.messageId).toBe('msg-1');
    });

    it('deduplicates messages by msgId', () => {
      const textHandler = handlers.get('message.text')!;
      const frame = { msgId: 'dup-1', userId: 'u', chatId: 'c', content: { text: 'hi' } };

      textHandler(frame);
      textHandler(frame);

      expect(onMessageMock).toHaveBeenCalledOnce();
    });

    it('handles group messages', () => {
      const textHandler = handlers.get('message.text')!;
      textHandler({
        msgId: 'msg-g1',
        userId: 'user-2',
        chatId: 'group-1',
        chatType: 'group',
        content: { text: 'Group msg' },
        mentioned: true,
      });

      const msg: ChannelMessage = onMessageMock.mock.calls[0][0];
      expect(msg.chatType).toBe('group');
      expect(msg.mentioned).toBe(true);
    });

    it('handles image frame with fallback text', () => {
      const imageHandler = handlers.get('message.image')!;
      imageHandler({
        msgId: 'img-1',
        userId: 'user-3',
        chatId: 'chat-2',
      });

      const msg: ChannelMessage = onMessageMock.mock.calls[0][0];
      expect(msg.text).toBe('(image)');
    });
  });

  describe('reply', () => {
    it('calls wsClient.replyStream with the frame', async () => {
      const msg: ChannelMessage = {
        channelType: 'wecom',
        senderId: 'u1',
        chatId: 'c1',
        chatType: 'dm',
        text: 'hi',
        raw: { frameData: 'original' },
      };

      await adapter.reply(msg, 'Reply text');

      expect(mockReplyStream).toHaveBeenCalledOnce();
      const [frame, _streamId, text, isFinal] = mockReplyStream.mock.calls[0];
      expect(frame).toEqual({ frameData: 'original' });
      expect(text).toBe('Reply text');
      expect(isFinal).toBe(true);
    });
  });

  describe('send', () => {
    it('calls wsClient.sendMessage with correct params', async () => {
      await adapter.send('chat-target', 'Proactive message');

      expect(mockSendMessage).toHaveBeenCalledOnce();
      expect(mockSendMessage).toHaveBeenCalledWith('chat-target', {
        msgtype: 'text',
        text: { content: 'Proactive message' },
      });
    });
  });

  describe('stop', () => {
    it('calls wsClient.disconnect()', async () => {
      await adapter.stop();
      expect(mockDisconnect).toHaveBeenCalledOnce();
    });
  });
});
