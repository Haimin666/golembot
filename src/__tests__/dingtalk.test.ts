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
    adapter = new DingtalkAdapter({ clientId: 'id', clientSecret: 'secret' });
    vi.clearAllMocks();
  });

  describe('send', () => {
    it('calls DingTalk group message API with correct params', async () => {
      // Start the adapter to initialize dwClient
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
      // Adapter not started — dwClient is null
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));
      try {
        await adapter.send('conv-123', 'test');
        expect(fetchSpy).not.toHaveBeenCalled();
      } finally {
        fetchSpy.mockRestore();
      }
    });
  });
});
