import { describe, it, expect } from 'vitest';
import { buildSessionKey, stripMention, type ChannelMessage } from '../channel.js';

describe('buildSessionKey', () => {
  it('generates key from channelType:chatId:senderId', () => {
    const msg: ChannelMessage = {
      channelType: 'feishu',
      senderId: 'ou_abc123',
      chatId: 'oc_group456',
      chatType: 'group',
      text: 'hello',
      raw: {},
    };
    expect(buildSessionKey(msg)).toBe('feishu:oc_group456:ou_abc123');
  });

  it('handles dm message', () => {
    const msg: ChannelMessage = {
      channelType: 'dingtalk',
      senderId: 'user001',
      chatId: 'conv_single',
      chatType: 'dm',
      text: 'hi',
      raw: {},
    };
    expect(buildSessionKey(msg)).toBe('dingtalk:conv_single:user001');
  });
});

describe('stripMention', () => {
  it('removes @BotName mentions', () => {
    expect(stripMention('@GolemBot help me query data')).toBe('help me query data');
  });

  it('removes <at> XML-style mentions (Feishu/DingTalk format)', () => {
    expect(stripMention('<at user_id="ou_xxx">GolemBot</at> help me query data')).toBe('help me query data');
  });

  it('removes multiple mentions', () => {
    expect(stripMention('@Bot1 @Bot2 hello world')).toBe('hello world');
  });

  it('handles text with no mentions', () => {
    expect(stripMention('hello world')).toBe('hello world');
  });

  it('handles empty string', () => {
    expect(stripMention('')).toBe('');
  });

  it('strips mentions and trims', () => {
    expect(stripMention('  @Bot  ')).toBe('');
  });
});
