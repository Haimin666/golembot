import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dingtalk-stream SDK
const mockGetAccessToken = vi.fn().mockResolvedValue('mock-access-token');
const mockSocketCallBackResponse = vi.fn();
const mockConnect = vi.fn().mockResolvedValue(undefined);

vi.mock('../peer-require.js', () => ({
  importPeer: vi.fn().mockResolvedValue({
    DWClient: class {
      getAccessToken = mockGetAccessToken;
      socketCallBackResponse = mockSocketCallBackResponse;
      connect = mockConnect;
      registerCallbackListener = vi.fn();
    },
    TOPIC_ROBOT: 'TOPIC_ROBOT',
  }),
}));

// Must import after mock
const { DingtalkAdapter } = await import('../channels/dingtalk.js');

describe('DingtalkAdapter', () => {
  let adapter: InstanceType<typeof DingtalkAdapter>;

  beforeEach(() => {
    adapter = new DingtalkAdapter({
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      cardTemplateId: 'd79a4cd8-1f56-47b7-b175-56a317fbd98f.schema',
    });
    vi.clearAllMocks();
  });

  describe('send', () => {
    it('calls DingTalk group message API with correct params', async () => {
      await adapter.start(() => {});

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));
      try {
        await adapter.send('conv-123', 'Hello from cron');

        expect(fetchSpy).toHaveBeenCalledOnce();
        const [url, opts] = fetchSpy.mock.calls[0];
        expect(url).toBe('https://api.dingtalk.com/v1.0/robot/groupMessages/send');
        expect(opts?.method).toBe('POST');
        expect(opts?.headers).toMatchObject({
          'Content-Type': 'application/json',
          'x-acs-dingtalk-access-token': 'mock-access-token',
        });

        const body = JSON.parse(opts?.body as string);
        expect(body.openConversationId).toBe('conv-123');
        expect(body.msgKey).toBe('sampleText');
        expect(JSON.parse(body.msgParam)).toEqual({ content: 'Hello from cron' });
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it('does nothing when dwClient has no access token', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));
      try {
        await adapter.send('conv-123', 'test');
        expect(fetchSpy).not.toHaveBeenCalled();
      } finally {
        fetchSpy.mockRestore();
      }
    });
  });

  describe('sendStatus (interactive card)', () => {
    it('creates interactive card for DM using correct API with receiverUserIdList', async () => {
      await adapter.start(() => {});

      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response(JSON.stringify({ success: true, result: { processQueryKey: 'key-123' } })));

      const dmMsg = {
        channelType: 'dingtalk',
        senderId: 'user-456',
        senderName: 'Test User',
        chatId: 'chat-789',
        chatType: 'dm' as const,
        text: 'hello',
        raw: { _sessionWebhook: 'https://webhook.example.com/test' },
      };

      try {
        const statusId = await adapter.sendStatus!(dmMsg, '⏳ Thinking...');

        // Should call the interactive cards API
        expect(fetchSpy).toHaveBeenCalled();
        const [url, opts] = fetchSpy.mock.calls[0];
        expect(url).toBe('https://api.dingtalk.com/v1.0/im/interactiveCards/send');
        expect(opts?.method).toBe('POST');

        const body = JSON.parse(opts?.body as string);
        // DM should use conversationType 0
        expect(body.conversationType).toBe(0);
        // DM should include receiverUserIdList
        expect(body.receiverUserIdList).toContain('user-456');
        // Should NOT include openConversationId for DM
        expect(body.openConversationId).toBeUndefined();
        // Should use the configured template
        expect(body.cardTemplateId).toBe('d79a4cd8-1f56-47b7-b175-56a317fbd98f.schema');
        // Should have cardData with cardParamMap
        expect(body.cardData).toBeDefined();
        expect(body.cardData.cardParamMap).toBeDefined();
        // Should return a tracking ID
        expect(statusId).toMatch(/^golem-/);
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it('creates interactive card for group chat using openConversationId', async () => {
      await adapter.start(() => {});

      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response(JSON.stringify({ success: true, result: { processQueryKey: 'key-123' } })));

      const groupMsg = {
        channelType: 'dingtalk',
        senderId: 'user-456',
        senderName: 'Test User',
        chatId: 'group-conversation-id',
        chatType: 'group' as const,
        text: '@bot hello',
        raw: { _sessionWebhook: 'https://webhook.example.com/test' },
      };

      try {
        const statusId = await adapter.sendStatus!(groupMsg, '⏳ Thinking...');

        const [url, opts] = fetchSpy.mock.calls[0];
        expect(url).toBe('https://api.dingtalk.com/v1.0/im/interactiveCards/send');

        const body = JSON.parse(opts?.body as string);
        // Group should use conversationType 1
        expect(body.conversationType).toBe(1);
        // Group should include openConversationId
        expect(body.openConversationId).toBe('group-conversation-id');
        // Group should still have cardTemplateId
        expect(body.cardTemplateId).toBe('d79a4cd8-1f56-47b7-b175-56a317fbd98f.schema');
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it('falls back to webhook markdown when card API fails', async () => {
      await adapter.start(() => {});

      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(new Response('Bad Request', { status: 400 })) // Card API fails
        .mockResolvedValueOnce(new Response('{}')); // Webhook fallback

      const dmMsg = {
        channelType: 'dingtalk',
        senderId: 'user-456',
        chatId: 'chat-789',
        chatType: 'dm' as const,
        text: 'hello',
        raw: { _sessionWebhook: 'https://webhook.example.com/fallback' },
      };

      try {
        const statusId = await adapter.sendStatus!(dmMsg, '⏳ Thinking...');

        // Should have called card API first
        expect(fetchSpy).toHaveBeenCalledTimes(2);
        const [cardUrl] = fetchSpy.mock.calls[0];
        expect(cardUrl).toBe('https://api.dingtalk.com/v1.0/im/interactiveCards/send');

        // Then fallback to webhook
        const [webhookUrl, webhookOpts] = fetchSpy.mock.calls[1];
        expect(webhookUrl).toBe('https://webhook.example.com/fallback');
        const webhookBody = JSON.parse(webhookOpts?.body as string);
        expect(webhookBody.msgtype).toBe('markdown');

        // Still returns tracking ID for consistency
        expect(statusId).toMatch(/^golem-/);
      } finally {
        fetchSpy.mockRestore();
      }
    });
  });

  describe('updateStatus (streaming card)', () => {
    it('updates card using streaming API with isFull=true for markdown', async () => {
      await adapter.start(() => {});

      // First, create a card
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ success: true })));

      const dmMsg = {
        channelType: 'dingtalk',
        senderId: 'user-456',
        chatId: 'chat-789',
        chatType: 'dm' as const,
        text: 'hello',
        raw: { _sessionWebhook: 'https://webhook.example.com/test' },
      };

      try {
        const statusId = await adapter.sendStatus!(dmMsg, '⏳ Thinking...');
        fetchSpy.mockClear();

        // updateStatus is called by gateway to finalize - always sets isFinalize=true
        await adapter.updateStatus!(dmMsg, statusId, '✍️ Writing response...');

        expect(fetchSpy).toHaveBeenCalled();
        const [url, opts] = fetchSpy.mock.calls[0];
        expect(url).toBe('https://api.dingtalk.com/v1.0/card/streaming');
        expect(opts?.method).toBe('PUT');

        const body = JSON.parse(opts?.body as string);
        expect(body.outTrackId).toBe(statusId);
        expect(body.key).toBeDefined(); // The template variable key
        expect(body.content).toBe('✍️ Writing response...');
        expect(body.isFull).toBe(true); // Required for markdown
        expect(body.isFinalize).toBe(true); // Always true for updateStatus (gateway finalize)
        expect(body.guid).toBeDefined(); // UUID for idempotency
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it('uses accumulated content when finalizing with Done', async () => {
      await adapter.start(() => {});

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ success: true })));

      const dmMsg = {
        channelType: 'dingtalk',
        senderId: 'user-456',
        chatId: 'chat-789',
        chatType: 'dm' as const,
        text: 'hello',
        raw: {},
      };

      try {
        const statusId = await adapter.sendStatus!(dmMsg, 'Thinking...');
        fetchSpy.mockClear();

        // Simulate streaming content updates via reply() - content accumulates
        await adapter.reply(dmMsg, 'First paragraph...');
        fetchSpy.mockClear();

        await adapter.reply(dmMsg, 'Second paragraph...');
        fetchSpy.mockClear();

        // Finalize with Done - should use accumulated content, not "Done"
        await adapter.updateStatus!(dmMsg, statusId, '✅ Done');

        const body = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
        // Should preserve accumulated content, not "Done"
        expect(body.content).toBe('First paragraph...Second paragraph...');
        expect(body.isFinalize).toBe(true);
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it('sets isFinalize=true for all updateStatus calls', async () => {
      await adapter.start(() => {});

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ success: true })));

      const dmMsg = {
        channelType: 'dingtalk',
        senderId: 'user-456',
        chatId: 'chat-789',
        chatType: 'dm' as const,
        text: 'hello',
        raw: {},
      };

      try {
        const statusId = await adapter.sendStatus!(dmMsg, 'Thinking...');
        fetchSpy.mockClear();

        // Any updateStatus call should set isFinalize=true (gateway calls this at end)
        await adapter.updateStatus!(dmMsg, statusId, 'Any content');

        const body = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
        expect(body.isFinalize).toBe(true);
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it('handles update failure gracefully', async () => {
      await adapter.start(() => {});

      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }))) // create card
        .mockResolvedValueOnce(new Response('Not Found', { status: 404 })); // update fails

      const dmMsg = {
        channelType: 'dingtalk',
        senderId: 'user-456',
        chatId: 'chat-789',
        chatType: 'dm' as const,
        text: 'hello',
        raw: {},
      };

      try {
        const statusId = await adapter.sendStatus!(dmMsg, 'Thinking...');
        fetchSpy.mockClear();

        // Should not throw
        await adapter.updateStatus!(dmMsg, statusId, 'Updated text');

        expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('card streaming update failed'));
      } finally {
        fetchSpy.mockRestore();
        consoleWarnSpy.mockRestore();
      }
    });
  });

  describe('clearStatus', () => {
    it('removes tracking state for the card', async () => {
      await adapter.start(() => {});

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ success: true })));

      const dmMsg = {
        channelType: 'dingtalk',
        senderId: 'user-456',
        chatId: 'chat-789',
        chatType: 'dm' as const,
        text: 'hello',
        raw: {},
      };

      try {
        const statusId = await adapter.sendStatus!(dmMsg, 'Thinking...');
        expect(adapter['streamCards'].has(statusId)).toBe(true);

        await adapter.clearStatus!(dmMsg, statusId);
        expect(adapter['streamCards'].has(statusId)).toBe(false);
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it('clears session active card mapping', async () => {
      await adapter.start(() => {});

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ success: true })));

      const dmMsg = {
        channelType: 'dingtalk',
        senderId: 'user-456',
        chatId: 'chat-789',
        chatType: 'dm' as const,
        text: 'hello',
        raw: {},
      };

      try {
        const statusId = await adapter.sendStatus!(dmMsg, 'Thinking...');
        const sessionKey = 'chat-789:user-456';
        expect(adapter['sessionActiveCards'].get(sessionKey)).toBe(statusId);

        await adapter.clearStatus!(dmMsg, statusId);
        expect(adapter['sessionActiveCards'].has(sessionKey)).toBe(false);
      } finally {
        fetchSpy.mockRestore();
      }
    });
  });

  describe('reply with streaming card', () => {
    it('updates streaming card instead of sending new message when card is active', async () => {
      await adapter.start(() => {});

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ success: true })));

      const dmMsg = {
        channelType: 'dingtalk',
        senderId: 'user-456',
        chatId: 'chat-789',
        chatType: 'dm' as const,
        text: 'hello',
        raw: { _sessionWebhook: 'https://webhook.example.com/test' },
      };

      try {
        // Create streaming card
        const statusId = await adapter.sendStatus!(dmMsg, '⏳ Thinking...');
        fetchSpy.mockClear();

        // Reply should update the card, not send to webhook
        await adapter.reply(dmMsg, 'This is streaming content...');

        // Should call streaming API, not webhook
        expect(fetchSpy).toHaveBeenCalledOnce();
        const [url, opts] = fetchSpy.mock.calls[0];
        expect(url).toBe('https://api.dingtalk.com/v1.0/card/streaming');
        expect(opts?.method).toBe('PUT');

        const body = JSON.parse(opts?.body as string);
        expect(body.outTrackId).toBe(statusId);
        expect(body.content).toBe('This is streaming content...');
        expect(body.isFinalize).toBe(false);
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it('accumulates content across multiple reply calls', async () => {
      await adapter.start(() => {});

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ success: true })));

      const dmMsg = {
        channelType: 'dingtalk',
        senderId: 'user-456',
        chatId: 'chat-789',
        chatType: 'dm' as const,
        text: 'hello',
        raw: { _sessionWebhook: 'https://webhook.example.com/test' },
      };

      try {
        // Create streaming card
        const statusId = await adapter.sendStatus!(dmMsg, '⏳ Thinking...');
        fetchSpy.mockClear();

        // First chunk
        await adapter.reply(dmMsg, 'First paragraph.\n\n');
        let body = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
        expect(body.content).toBe('First paragraph.\n\n');
        fetchSpy.mockClear();

        // Second chunk - should be accumulated
        await adapter.reply(dmMsg, 'Second paragraph.');
        body = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
        expect(body.content).toBe('First paragraph.\n\nSecond paragraph.');
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it('sends regular message when no active streaming card', async () => {
      await adapter.start(() => {});

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));

      const dmMsg = {
        channelType: 'dingtalk',
        senderId: 'user-456',
        chatId: 'chat-789',
        chatType: 'dm' as const,
        text: 'hello',
        raw: { _sessionWebhook: 'https://webhook.example.com/test' },
      };

      try {
        // No sendStatus called, so no active card
        await adapter.reply(dmMsg, 'Regular reply');

        // Should send to webhook, not streaming API
        expect(fetchSpy).toHaveBeenCalledOnce();
        const [url, opts] = fetchSpy.mock.calls[0];
        expect(url).toBe('https://webhook.example.com/test');
        expect(opts?.method).toBe('POST');

        const body = JSON.parse(opts?.body as string);
        expect(body.msgtype).toBe('text');
        expect(body.text.content).toBe('Regular reply');
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it('sends regular message after streaming card is cleared', async () => {
      await adapter.start(() => {});

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ success: true })));

      const dmMsg = {
        channelType: 'dingtalk',
        senderId: 'user-456',
        chatId: 'chat-789',
        chatType: 'dm' as const,
        text: 'hello',
        raw: { _sessionWebhook: 'https://webhook.example.com/test' },
      };

      try {
        // Create streaming card
        const statusId = await adapter.sendStatus!(dmMsg, '⏳ Thinking...');
        fetchSpy.mockClear();

        // Clear the card
        await adapter.clearStatus!(dmMsg, statusId);
        fetchSpy.mockClear();

        // Now reply should send regular message
        await adapter.reply(dmMsg, 'After streaming is done');

        // Should send to webhook
        expect(fetchSpy).toHaveBeenCalledOnce();
        const [url] = fetchSpy.mock.calls[0];
        expect(url).toBe('https://webhook.example.com/test');
      } finally {
        fetchSpy.mockRestore();
      }
    });
  });
});
