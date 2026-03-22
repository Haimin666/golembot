import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChannelMessage } from '../channel.js';

// Helpers ─────────────────────────────────────────────────────────────────────

function makeILinkMsg(overrides: Record<string, unknown> = {}) {
  return {
    from_user_id: 'wxid_sender',
    client_id: 'msg-001',
    message_type: 1,
    context_token: 'ct-001',
    item_list: [{ type: 1, text_item: { text: 'hello' } }],
    ...overrides,
  };
}

function mockPollResponse(msgs: unknown[], syncBuf = 'buf-1') {
  return new Response(JSON.stringify({ ret: 0, msgs, get_updates_buf: syncBuf }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function hangForever(): Promise<Response> {
  return new Promise(() => {}); // never resolves — stopped by abort
}

// ─────────────────────────────────────────────────────────────────────────────

describe('WeixinAdapter', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function createAdapter(configOverrides: Record<string, unknown> = {}) {
    const { WeixinAdapter } = await import('../channels/weixin.js');
    return new WeixinAdapter({ token: 'test-token', ...configOverrides });
  }

  // ── Properties ──────────────────────────────────────────────────────────

  describe('properties', () => {
    it('name is "weixin"', async () => {
      const adapter = await createAdapter();
      expect(adapter.name).toBe('weixin');
    });

    it('maxMessageLength is 2000', async () => {
      const adapter = await createAdapter();
      expect(adapter.maxMessageLength).toBe(2000);
    });
  });

  // ── start() ─────────────────────────────────────────────────────────────

  describe('start', () => {
    it('throws if token is missing', async () => {
      const { WeixinAdapter } = await import('../channels/weixin.js');
      const adapter = new WeixinAdapter({ token: '' } as any);
      await expect(adapter.start(() => {})).rejects.toThrow('token');
    });

    it('begins polling when started', async () => {
      fetchMock.mockImplementation(() => hangForever());
      const adapter = await createAdapter();
      await adapter.start(() => {});
      // fetch should have been called at least once (getupdates)
      expect(fetchMock).toHaveBeenCalled();
      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain('getupdates');
      await adapter.stop();
    });
  });

  // ── Message parsing ─────────────────────────────────────────────────────

  describe('message parsing', () => {
    it('parses text messages (item type 1)', async () => {
      fetchMock.mockResolvedValueOnce(mockPollResponse([makeILinkMsg()])).mockImplementation(() => hangForever());

      const received: ChannelMessage[] = [];
      const adapter = await createAdapter();
      await adapter.start((msg) => {
        received.push(msg);
      });
      await new Promise((r) => setTimeout(r, 50));
      await adapter.stop();

      expect(received).toHaveLength(1);
      expect(received[0].text).toBe('hello');
      expect(received[0].channelType).toBe('weixin');
      expect(received[0].senderId).toBe('wxid_sender');
      expect(received[0].chatId).toBe('wxid_sender');
      expect(received[0].chatType).toBe('dm');
      expect(received[0].messageId).toBe('msg-001');
    });

    it('parses image messages (item type 2) with placeholder text', async () => {
      fetchMock
        .mockResolvedValueOnce(mockPollResponse([makeILinkMsg({ item_list: [{ type: 2, image_item: {} }] })]))
        .mockImplementation(() => hangForever());

      const received: ChannelMessage[] = [];
      const adapter = await createAdapter();
      await adapter.start((msg) => {
        received.push(msg);
      });
      await new Promise((r) => setTimeout(r, 50));
      await adapter.stop();

      expect(received).toHaveLength(1);
      expect(received[0].text).toBe('(image)');
    });

    it('parses voice messages (item type 3) with transcription fallback', async () => {
      fetchMock
        .mockResolvedValueOnce(
          mockPollResponse([makeILinkMsg({ item_list: [{ type: 3, voice_item: { text: 'transcribed text' } }] })]),
        )
        .mockImplementation(() => hangForever());

      const received: ChannelMessage[] = [];
      const adapter = await createAdapter();
      await adapter.start((msg) => {
        received.push(msg);
      });
      await new Promise((r) => setTimeout(r, 50));
      await adapter.stop();

      expect(received).toHaveLength(1);
      expect(received[0].text).toBe('transcribed text');
    });

    it('parses voice messages without transcription as "(voice)"', async () => {
      fetchMock
        .mockResolvedValueOnce(mockPollResponse([makeILinkMsg({ item_list: [{ type: 3, voice_item: {} }] })]))
        .mockImplementation(() => hangForever());

      const received: ChannelMessage[] = [];
      const adapter = await createAdapter();
      await adapter.start((msg) => {
        received.push(msg);
      });
      await new Promise((r) => setTimeout(r, 50));
      await adapter.stop();

      expect(received).toHaveLength(1);
      expect(received[0].text).toBe('(voice)');
    });

    it('parses file messages (item type 4)', async () => {
      fetchMock
        .mockResolvedValueOnce(mockPollResponse([makeILinkMsg({ item_list: [{ type: 4, file_item: {} }] })]))
        .mockImplementation(() => hangForever());

      const received: ChannelMessage[] = [];
      const adapter = await createAdapter();
      await adapter.start((msg) => {
        received.push(msg);
      });
      await new Promise((r) => setTimeout(r, 50));
      await adapter.stop();

      expect(received).toHaveLength(1);
      expect(received[0].text).toBe('(file)');
    });

    it('parses video messages (item type 5)', async () => {
      fetchMock
        .mockResolvedValueOnce(mockPollResponse([makeILinkMsg({ item_list: [{ type: 5, video_item: {} }] })]))
        .mockImplementation(() => hangForever());

      const received: ChannelMessage[] = [];
      const adapter = await createAdapter();
      await adapter.start((msg) => {
        received.push(msg);
      });
      await new Promise((r) => setTimeout(r, 50));
      await adapter.stop();

      expect(received).toHaveLength(1);
      expect(received[0].text).toBe('(video)');
    });

    it('skips bot messages (message_type !== 1)', async () => {
      fetchMock
        .mockResolvedValueOnce(mockPollResponse([makeILinkMsg({ message_type: 2 })]))
        .mockImplementation(() => hangForever());

      const received: ChannelMessage[] = [];
      const adapter = await createAdapter();
      await adapter.start((msg) => {
        received.push(msg);
      });
      await new Promise((r) => setTimeout(r, 50));
      await adapter.stop();

      expect(received).toHaveLength(0);
    });

    it('skips messages with empty item_list', async () => {
      fetchMock
        .mockResolvedValueOnce(mockPollResponse([makeILinkMsg({ item_list: [] })]))
        .mockImplementation(() => hangForever());

      const received: ChannelMessage[] = [];
      const adapter = await createAdapter();
      await adapter.start((msg) => {
        received.push(msg);
      });
      await new Promise((r) => setTimeout(r, 50));
      await adapter.stop();

      expect(received).toHaveLength(0);
    });

    it('preserves raw object including context_token', async () => {
      fetchMock.mockResolvedValueOnce(mockPollResponse([makeILinkMsg()])).mockImplementation(() => hangForever());

      const received: ChannelMessage[] = [];
      const adapter = await createAdapter();
      await adapter.start((msg) => {
        received.push(msg);
      });
      await new Promise((r) => setTimeout(r, 50));
      await adapter.stop();

      expect((received[0].raw as any).context_token).toBe('ct-001');
    });
  });

  // ── Sync buffer ─────────────────────────────────────────────────────────

  describe('syncBuffer management', () => {
    it('sends updated syncBuffer in subsequent poll requests', async () => {
      fetchMock
        .mockResolvedValueOnce(mockPollResponse([], 'buf-round-1'))
        .mockResolvedValueOnce(mockPollResponse([], 'buf-round-2'))
        .mockImplementation(() => hangForever());

      const adapter = await createAdapter();
      await adapter.start(() => {});
      await new Promise((r) => setTimeout(r, 100));
      await adapter.stop();

      // Second poll should carry the syncBuffer from first response
      expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
      const secondCallBody = JSON.parse(fetchMock.mock.calls[1][1].body);
      expect(secondCallBody.get_updates_buf).toBe('buf-round-1');
    });
  });

  // ── Deduplication ───────────────────────────────────────────────────────

  describe('deduplication', () => {
    it('deduplicates messages with the same client_id across polls', async () => {
      const sameMsg = makeILinkMsg({ client_id: 'dup-001' });

      fetchMock
        .mockResolvedValueOnce(mockPollResponse([sameMsg]))
        .mockResolvedValueOnce(mockPollResponse([sameMsg]))
        .mockImplementation(() => hangForever());

      const received: ChannelMessage[] = [];
      const adapter = await createAdapter();
      await adapter.start((msg) => {
        received.push(msg);
      });
      await new Promise((r) => setTimeout(r, 100));
      await adapter.stop();

      expect(received).toHaveLength(1);
    });

    it('allows different client_ids through', async () => {
      fetchMock
        .mockResolvedValueOnce(
          mockPollResponse([
            makeILinkMsg({ client_id: 'msg-a' }),
            makeILinkMsg({ client_id: 'msg-b', from_user_id: 'wxid_other' }),
          ]),
        )
        .mockImplementation(() => hangForever());

      const received: ChannelMessage[] = [];
      const adapter = await createAdapter();
      await adapter.start((msg) => {
        received.push(msg);
      });
      await new Promise((r) => setTimeout(r, 50));
      await adapter.stop();

      expect(received).toHaveLength(2);
    });
  });

  // ── reply() ─────────────────────────────────────────────────────────────

  describe('reply', () => {
    it('sends message with correct context_token from msg.raw', async () => {
      fetchMock.mockResolvedValue(new Response('{"ret":0}', { status: 200 }));

      const adapter = await createAdapter();
      const msg: ChannelMessage = {
        channelType: 'weixin',
        senderId: 'wxid_alice',
        chatId: 'wxid_alice',
        chatType: 'dm',
        text: 'hi',
        raw: { context_token: 'ct-alice' },
      };

      await adapter.reply(msg, 'Hello Alice!');

      const sendCalls = fetchMock.mock.calls.filter((call: unknown[]) => (call[0] as string).includes('sendmessage'));
      expect(sendCalls).toHaveLength(1);
      const body = JSON.parse(sendCalls[0][1].body);
      expect(body.msg.context_token).toBe('ct-alice');
      expect(body.msg.to_user_id).toBe('wxid_alice');
      expect(body.msg.item_list[0].text_item.text).toBe('Hello Alice!');
      expect(body.msg.message_type).toBe(2);
    });

    it('falls back to stored context_token when msg.raw lacks it', async () => {
      // First: poll to store context_token
      fetchMock
        .mockResolvedValueOnce(mockPollResponse([makeILinkMsg({ from_user_id: 'wxid_bob', context_token: 'ct-bob' })]))
        .mockImplementation(() => hangForever());

      const adapter = await createAdapter();
      await adapter.start(() => {});
      await new Promise((r) => setTimeout(r, 50));

      // Reset mock for reply call
      fetchMock.mockResolvedValueOnce(new Response('{"ret":0}', { status: 200 }));

      const msg: ChannelMessage = {
        channelType: 'weixin',
        senderId: 'wxid_bob',
        chatId: 'wxid_bob',
        chatType: 'dm',
        text: 'hi',
        raw: {}, // no context_token in raw
      };

      await adapter.reply(msg, 'Reply to Bob');
      await adapter.stop();

      const sendCalls = fetchMock.mock.calls.filter((call: unknown[]) => (call[0] as string).includes('sendmessage'));
      expect(sendCalls).toHaveLength(1);
      const body = JSON.parse(sendCalls[0][1].body);
      expect(body.msg.context_token).toBe('ct-bob');
    });

    it('logs error when no context_token is available', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const adapter = await createAdapter();
      const msg: ChannelMessage = {
        channelType: 'weixin',
        senderId: 'wxid_unknown',
        chatId: 'wxid_unknown',
        chatType: 'dm',
        text: 'hi',
        raw: {},
      };

      await adapter.reply(msg, 'no token');

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('no context_token'));
      // sendmessage should NOT have been called
      const sendCalls = fetchMock.mock.calls.filter((call: unknown[]) => (call[0] as string).includes('sendmessage'));
      expect(sendCalls).toHaveLength(0);
    });

    it('sends correct Authorization header', async () => {
      fetchMock.mockResolvedValue(new Response('{"ret":0}', { status: 200 }));
      const adapter = await createAdapter();
      const msg: ChannelMessage = {
        channelType: 'weixin',
        senderId: 'wxid_a',
        chatId: 'wxid_a',
        chatType: 'dm',
        text: 'hi',
        raw: { context_token: 'ct-a' },
      };
      await adapter.reply(msg, 'test');

      const sendCall = fetchMock.mock.calls.find((call: unknown[]) => (call[0] as string).includes('sendmessage'));
      expect(sendCall).toBeDefined();
      expect((sendCall![1] as any).headers.Authorization).toBe('Bearer test-token');
      expect((sendCall![1] as any).headers.AuthorizationType).toBe('ilink_bot_token');
    });
  });

  // ── Error handling ──────────────────────────────────────────────────────

  describe('error handling', () => {
    it('stops polling permanently on 401', async () => {
      fetchMock.mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const adapter = await createAdapter();
      await adapter.start(() => {});
      await new Promise((r) => setTimeout(r, 50));

      const pollCalls = fetchMock.mock.calls.filter((call: unknown[]) => (call[0] as string).includes('getupdates'));
      expect(pollCalls).toHaveLength(1); // no retry
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('expired'));
    });

    it('retries with backoff on network error', async () => {
      vi.useFakeTimers();

      fetchMock
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockResolvedValueOnce(mockPollResponse([]))
        .mockImplementation(() => hangForever());

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const adapter = await createAdapter();
      await adapter.start(() => {});

      // Advance past the 1s backoff delay
      await vi.advanceTimersByTimeAsync(1100);

      const pollCalls = fetchMock.mock.calls.filter((call: unknown[]) => (call[0] as string).includes('getupdates'));
      expect(pollCalls.length).toBeGreaterThanOrEqual(2);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Retrying'));

      await adapter.stop();
      vi.useRealTimers();
    });
  });

  // ── stop() ──────────────────────────────────────────────────────────────

  describe('stop', () => {
    it('aborts in-flight poll and exits loop', async () => {
      fetchMock.mockImplementation(() => hangForever());

      const adapter = await createAdapter();
      await adapter.start(() => {});
      await adapter.stop();

      // Should not throw, should be idempotent
      await adapter.stop();
    });
  });

  // ── E2E round-trip ──────────────────────────────────────────────────────

  describe('E2E round-trip (mocked HTTP)', () => {
    it('poll → parse → onMessage → reply', async () => {
      // getupdates returns one message, then hangs
      fetchMock
        .mockResolvedValueOnce(
          mockPollResponse([
            makeILinkMsg({
              from_user_id: 'wxid_alice',
              client_id: 'e2e-001',
              context_token: 'ct-e2e',
              item_list: [{ type: 1, text_item: { text: 'Hello bot' } }],
            }),
          ]),
        )
        .mockImplementation((url: string) => {
          if (url.includes('sendmessage')) {
            return Promise.resolve(new Response('{"ret":0}', { status: 200 }));
          }
          return hangForever();
        });

      const received: ChannelMessage[] = [];
      const adapter = await createAdapter();

      await adapter.start(async (msg) => {
        received.push(msg);
        await adapter.reply(msg, 'Hi Alice!');
      });

      await new Promise((r) => setTimeout(r, 80));
      await adapter.stop();

      // Verify message was received correctly
      expect(received).toHaveLength(1);
      expect(received[0].text).toBe('Hello bot');
      expect(received[0].senderId).toBe('wxid_alice');
      expect(received[0].channelType).toBe('weixin');

      // Verify reply was sent with correct context_token
      const sendCalls = fetchMock.mock.calls.filter((call: unknown[]) => (call[0] as string).includes('sendmessage'));
      expect(sendCalls).toHaveLength(1);
      const body = JSON.parse(sendCalls[0][1].body);
      expect(body.msg.context_token).toBe('ct-e2e');
      expect(body.msg.item_list[0].text_item.text).toBe('Hi Alice!');
    });

    it('context_token isolation across multiple senders', async () => {
      fetchMock
        .mockResolvedValueOnce(
          mockPollResponse([
            makeILinkMsg({
              from_user_id: 'wxid_alice',
              client_id: 'multi-1',
              context_token: 'ct-alice',
            }),
            makeILinkMsg({
              from_user_id: 'wxid_bob',
              client_id: 'multi-2',
              context_token: 'ct-bob',
            }),
          ]),
        )
        .mockImplementation((url: string) => {
          if (url.includes('sendmessage')) {
            return Promise.resolve(new Response('{"ret":0}', { status: 200 }));
          }
          return hangForever();
        });

      const received: ChannelMessage[] = [];
      const adapter = await createAdapter();

      await adapter.start((msg) => {
        received.push(msg);
      });
      await new Promise((r) => setTimeout(r, 50));

      // Reply to Alice
      await adapter.reply(received[0], 'reply to alice');
      // Reply to Bob
      await adapter.reply(received[1], 'reply to bob');
      await adapter.stop();

      const sendCalls = fetchMock.mock.calls.filter((call: unknown[]) => (call[0] as string).includes('sendmessage'));
      expect(sendCalls).toHaveLength(2);
      expect(JSON.parse(sendCalls[0][1].body).msg.context_token).toBe('ct-alice');
      expect(JSON.parse(sendCalls[1][1].body).msg.context_token).toBe('ct-bob');
    });

    it('deduplication across multiple poll cycles', async () => {
      const msg = makeILinkMsg({ client_id: 'dedup-e2e' });

      fetchMock
        .mockResolvedValueOnce(mockPollResponse([msg]))
        .mockResolvedValueOnce(mockPollResponse([msg])) // duplicate
        .mockImplementation(() => hangForever());

      const received: ChannelMessage[] = [];
      const adapter = await createAdapter();
      await adapter.start((msg) => {
        received.push(msg);
      });
      await new Promise((r) => setTimeout(r, 100));
      await adapter.stop();

      expect(received).toHaveLength(1);
    });
  });
});
