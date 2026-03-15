import { describe, expect, it } from 'vitest';
import {
  buildDashboardData,
  createMetrics,
  type DashboardContext,
  type RecentMessage,
  recordMessage,
  renderDashboard,
} from '../dashboard.js';

function makeDashboardCtx(overrides?: Partial<DashboardContext>): DashboardContext {
  return {
    config: {
      name: 'test-bot',
      engine: 'claude-code',
      model: 'claude-opus-4-6',
      channels: {},
      gateway: { port: 3000 },
    },
    skills: [{ name: 'general', path: '/skills/general', description: 'General assistant' }],
    channelStatuses: [
      { type: 'telegram', status: 'connected' },
      { type: 'slack', status: 'not_configured' },
      { type: 'feishu', status: 'failed', error: 'missing appId' },
    ],
    metrics: createMetrics(),
    startTime: Date.now() - 60_000,
    version: '1.2.3',
    ...overrides,
  };
}

describe('createMetrics', () => {
  it('returns zeroed metrics', () => {
    const m = createMetrics();
    expect(m.totalMessages).toBe(0);
    expect(m.totalCostUsd).toBe(0);
    expect(m.recentMessages).toHaveLength(0);
    expect(m.eventSubscribers.size).toBe(0);
  });
});

describe('recordMessage', () => {
  it('increments counters and adds to recentMessages', () => {
    const m = createMetrics();
    const msg: RecentMessage = {
      ts: new Date().toISOString(),
      source: 'telegram',
      sender: 'alice',
      messagePreview: 'hello',
      responsePreview: 'hi there',
      durationMs: 1500,
      costUsd: 0.01,
    };
    recordMessage(m, msg);
    expect(m.totalMessages).toBe(1);
    expect(m.totalCostUsd).toBeCloseTo(0.01);
    expect(m.totalDurationMs).toBe(1500);
    expect(m.messagesBySource.telegram).toBe(1);
    expect(m.recentMessages).toHaveLength(1);
  });

  it('caps recentMessages at 100', () => {
    const m = createMetrics();
    for (let i = 0; i < 110; i++) {
      recordMessage(m, {
        ts: new Date().toISOString(),
        source: 'http',
        sender: 'user',
        messagePreview: `msg ${i}`,
        responsePreview: 'ok',
      });
    }
    expect(m.recentMessages).toHaveLength(100);
    expect(m.totalMessages).toBe(110);
  });

  it('records [PASS] messages', () => {
    const m = createMetrics();
    recordMessage(m, {
      ts: new Date().toISOString(),
      source: 'feishu',
      sender: 'bob',
      messagePreview: 'hey',
      responsePreview: '',
      passed: true,
    });
    expect(m.totalMessages).toBe(1);
    expect(m.recentMessages[0].passed).toBe(true);
  });
});

describe('buildDashboardData', () => {
  it('computes avgDurationMs correctly', async () => {
    const ctx = makeDashboardCtx();
    ctx.metrics.totalMessages = 4;
    ctx.metrics.totalDurationMs = 8000;
    const data = await buildDashboardData(ctx);
    expect(data.metrics.avgDurationMs).toBe(2000);
  });

  it('returns 0 avg when no messages', async () => {
    const data = await buildDashboardData(makeDashboardCtx());
    expect(data.metrics.avgDurationMs).toBe(0);
  });

  it('includes all fields', async () => {
    const data = await buildDashboardData(makeDashboardCtx());
    expect(data.name).toBe('test-bot');
    expect(data.engine).toBe('claude-code');
    expect(data.model).toBe('claude-opus-4-6');
    expect(data.version).toBe('1.2.3');
    expect(data.channels).toHaveLength(3);
    expect(data.skills).toHaveLength(1);
    expect(data.recentMessages).toEqual([]);
  });

  it('includes recentMessages snapshot', async () => {
    const ctx = makeDashboardCtx();
    recordMessage(ctx.metrics, {
      ts: '2026-01-01T00:00:00Z',
      source: 'http',
      sender: 'alice',
      messagePreview: 'hi',
      responsePreview: 'hello',
    });
    const data = await buildDashboardData(ctx);
    expect(data.recentMessages).toHaveLength(1);
    expect(data.recentMessages[0].sender).toBe('alice');
  });
});

describe('renderDashboard', () => {
  it('returns valid HTML with key elements', async () => {
    const data = await buildDashboardData(makeDashboardCtx());
    const html = renderDashboard(data);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('GolemBot');
    expect(html).toContain('test-bot');
    expect(html).toContain('claude-code');
    expect(html).toContain('claude-opus-4-6');
    expect(html).toContain('v1.2.3');
  });

  it('shows connected channels with green dot', async () => {
    const data = await buildDashboardData(makeDashboardCtx());
    const html = renderDashboard(data);
    expect(html).toContain('dot-green');
    expect(html).toContain('Telegram');
  });

  it('shows failed channels with red dot and error', async () => {
    const data = await buildDashboardData(makeDashboardCtx());
    const html = renderDashboard(data);
    expect(html).toContain('dot-red');
    expect(html).toContain('missing appId');
  });

  it('shows unconfigured channels with setup guide link', async () => {
    const data = await buildDashboardData(makeDashboardCtx());
    const html = renderDashboard(data);
    expect(html).toContain('Setup Guide');
    expect(html).toContain('/channels/slack');
  });

  it('includes HTTP API curl example with highlighting', async () => {
    const data = await buildDashboardData(makeDashboardCtx());
    const html = renderDashboard(data);
    expect(html).toContain('POST /chat');
    expect(html).toContain('hl-cmd');
    expect(html).toContain('hl-str');
  });

  it('includes embed SDK code example', async () => {
    const data = await buildDashboardData(makeDashboardCtx());
    const html = renderDashboard(data);
    expect(html).toContain('createAssistant');
  });

  it('shows skills list', async () => {
    const data = await buildDashboardData(makeDashboardCtx());
    const html = renderDashboard(data);
    expect(html).toContain('general');
    expect(html).toContain('General assistant');
  });

  it('includes Quick Test section', async () => {
    const data = await buildDashboardData(makeDashboardCtx());
    const html = renderDashboard(data);
    expect(html).toContain('Quick Test');
    expect(html).toContain('test-msg');
    expect(html).toContain('sendTest');
  });

  it('shows step numbers on access method cards', async () => {
    const data = await buildDashboardData(makeDashboardCtx());
    const html = renderDashboard(data);
    expect(html).toContain('"step">1');
    expect(html).toContain('"step">2');
    expect(html).toContain('"step">3');
  });

  it('shows connected count in subtitle', async () => {
    const data = await buildDashboardData(makeDashboardCtx());
    const html = renderDashboard(data);
    expect(html).toContain('1 channel connected');
  });

  it('escapes HTML in bot name', async () => {
    const ctx = makeDashboardCtx();
    ctx.config.name = '<script>alert(1)</script>';
    const data = await buildDashboardData(ctx);
    const html = renderDashboard(data);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('renders escalation panel when escalations exist', async () => {
    const data = await buildDashboardData(makeDashboardCtx());
    // Inject escalation data directly
    data.escalations = [
      { ts: '2026-03-15T10:00:00Z', reason: 'User needs help', sessionKey: 'feishu:chat:user1', status: 'open' },
    ];
    const html = renderDashboard(data);
    expect(html).toContain('Escalations');
    expect(html).toContain('User needs help');
    expect(html).toContain('open');
  });

  it('omits escalation panel when no escalations', async () => {
    const data = await buildDashboardData(makeDashboardCtx());
    data.escalations = [];
    const html = renderDashboard(data);
    expect(html).not.toContain('Escalations');
  });

  it('renders persona card when persona is set', async () => {
    const ctx = makeDashboardCtx();
    ctx.config.persona = {
      displayName: 'TestBot',
      role: 'Support Agent',
      tone: 'friendly',
      boundaries: ['no financial advice'],
    };
    const data = await buildDashboardData(ctx);
    const html = renderDashboard(data);
    expect(html).toContain('Persona');
    expect(html).toContain('TestBot');
    expect(html).toContain('Support Agent');
    expect(html).toContain('friendly');
    expect(html).toContain('no financial advice');
  });

  it('omits persona card when no persona', async () => {
    const data = await buildDashboardData(makeDashboardCtx());
    const html = renderDashboard(data);
    expect(html).not.toContain('🎭');
  });

  it('renders skill inventory grouped by type', async () => {
    const ctx = makeDashboardCtx({
      skills: [
        { name: 'general', path: '/skills/general', description: 'General assistant', type: 'behavior' },
        { name: 'escalation', path: '/skills/escalation', description: 'Escalation protocol', type: 'protocol' },
        { name: 'kb-guide', path: '/skills/kb-guide', description: 'KB integration', type: 'integration' },
      ],
    });
    const data = await buildDashboardData(ctx);
    const html = renderDashboard(data);
    expect(html).toContain('Skill Inventory');
    expect(html).toContain('behavior');
    expect(html).toContain('protocol');
    expect(html).toContain('integration');
    expect(html).toContain('skill-type-badge');
  });

  it('renders active sessions panel', async () => {
    const data = await buildDashboardData(makeDashboardCtx());
    data.activeSessions = [
      { key: 'feishu:chat:user1', lastActivity: '2026-03-15T10:00:00Z' },
      { key: 'slack:chan:user2', lastActivity: '2026-03-15T09:30:00Z' },
    ];
    const html = renderDashboard(data);
    expect(html).toContain('Active Sessions');
    expect(html).toContain('feishu:chat:user1');
    expect(html).toContain('slack:chan:user2');
  });

  it('omits active sessions panel when empty', async () => {
    const data = await buildDashboardData(makeDashboardCtx());
    data.activeSessions = [];
    const html = renderDashboard(data);
    expect(html).not.toContain('Active Sessions');
  });

  it('renders memory overview panel', async () => {
    const data = await buildDashboardData(makeDashboardCtx());
    data.memoryOverview = {
      notesPreview: '## Preferences\n- User likes concise style',
      groupFiles: ['team-a.md', 'team-b.json'],
      recentSummaries: ['2026-03-14.md', '2026-03-15.md'],
    };
    const html = renderDashboard(data);
    expect(html).toContain('Memory');
    expect(html).toContain('User likes concise style');
    expect(html).toContain('team-a.md');
    expect(html).toContain('2026-03-15.md');
  });

  it('omits memory overview when no data', async () => {
    const data = await buildDashboardData(makeDashboardCtx());
    data.memoryOverview = undefined;
    const html = renderDashboard(data);
    // Memory section should not appear (check for the icon+heading combo)
    const memoryMatches = html.match(/🧠.*Memory/g);
    expect(memoryMatches).toBeNull();
  });

  // ── Configuration panel tests ─────────────────────────────

  it('renders configuration panel with engine & runtime settings', async () => {
    const ctx = makeDashboardCtx({
      config: {
        name: 'test-bot',
        engine: 'cursor',
        model: 'sonnet-4.6',
        timeout: 600,
        maxConcurrent: 5,
        sessionTtlDays: 14,
        gateway: { port: 3000, host: '0.0.0.0', token: 'secret-token-123' },
      },
    });
    const data = await buildDashboardData(ctx);
    const html = renderDashboard(data);
    expect(html).toContain('Configuration');
    expect(html).toContain('Engine');
    expect(html).toContain('cursor');
    expect(html).toContain('600');
    expect(html).toContain('14');
    expect(html).toContain('Gateway');
    // Token must be masked
    expect(html).not.toContain('secret-token-123');
    expect(html).toContain('secr');
    expect(html).toContain('****');
  });

  it('renders provider section with masked API key', async () => {
    const ctx = makeDashboardCtx({
      config: {
        name: 'test-bot',
        engine: 'claude-code',
        provider: {
          baseUrl: 'https://api.example.com/v1',
          apiKey: 'sk-abcdefghijklmnop',
          model: 'custom-model',
          failoverThreshold: 5,
          fallback: {
            baseUrl: 'https://backup.example.com',
            apiKey: 'sk-backup12345678',
          },
        },
      },
    });
    const data = await buildDashboardData(ctx);
    const html = renderDashboard(data);
    expect(html).toContain('Provider');
    expect(html).toContain('api.example.com');
    // API key must be masked
    expect(html).not.toContain('sk-abcdefghijklmnop');
    expect(html).toContain('sk-a');
    expect(html).toContain('****');
    expect(html).toContain('custom-model');
    expect(html).toContain('Fallback');
    expect(html).not.toContain('sk-backup12345678');
  });

  it('renders group chat and streaming config', async () => {
    const ctx = makeDashboardCtx({
      config: {
        name: 'test-bot',
        engine: 'cursor',
        groupChat: { groupPolicy: 'smart', historyLimit: 30, maxTurns: 5 },
        streaming: { mode: 'streaming', showToolCalls: true },
      },
    });
    const data = await buildDashboardData(ctx);
    const html = renderDashboard(data);
    expect(html).toContain('Group Chat');
    expect(html).toContain('smart');
    expect(html).toContain('30');
    expect(html).toContain('Streaming');
    expect(html).toContain('Enabled');
  });

  it('renders permissions config', async () => {
    const ctx = makeDashboardCtx({
      config: {
        name: 'test-bot',
        engine: 'cursor',
        permissions: {
          allowedPaths: ['src/', 'docs/'],
          deniedPaths: ['.env', 'secrets/'],
          allowedCommands: ['npm test'],
          deniedCommands: ['rm -rf'],
        },
      },
    });
    const data = await buildDashboardData(ctx);
    const html = renderDashboard(data);
    expect(html).toContain('Permissions');
    expect(html).toContain('src/');
    expect(html).toContain('.env');
    expect(html).toContain('npm test');
    expect(html).toContain('rm -rf');
  });

  it('renders advanced section with MCP servers and system prompt', async () => {
    const ctx = makeDashboardCtx({
      config: {
        name: 'test-bot',
        engine: 'cursor',
        systemPrompt: 'You are a helpful coding assistant.',
        mcp: {
          'my-db': { command: 'npx', args: ['-y', 'mcp-db'] },
          'my-search': { command: 'node', args: ['search.js'] },
        },
      },
    });
    const data = await buildDashboardData(ctx);
    const html = renderDashboard(data);
    expect(html).toContain('Advanced');
    expect(html).toContain('System Prompt');
    expect(html).toContain('helpful coding assistant');
    expect(html).toContain('MCP Servers');
    expect(html).toContain('my-db');
    expect(html).toContain('my-search');
  });

  // ── Skills deduplication tests ─────────────────────────────

  it('does not render skills inside Monitoring section', async () => {
    const ctx = makeDashboardCtx({
      skills: [
        { name: 'general', path: '/skills/general', description: 'General', type: 'behavior' },
        { name: 'im-adapter', path: '/skills/im-adapter', description: 'IM', type: 'behavior' },
      ],
    });
    const data = await buildDashboardData(ctx);
    const html = renderDashboard(data);
    // Monitoring section should contain Statistics but NOT Skills
    const monitoringStart = html.indexOf('Monitoring');
    const skillInventoryStart = html.indexOf('Skill Inventory');
    expect(monitoringStart).toBeGreaterThan(-1);
    expect(skillInventoryStart).toBeGreaterThan(-1);
    // Between "Monitoring" and the stat-grid, there should be no skill-row
    const monitoringSlice = html.slice(monitoringStart, monitoringStart + 500);
    expect(monitoringSlice).toContain('stat-grid');
    expect(monitoringSlice).not.toContain('skill-row');
  });

  it('renders skill inventory for skills without types', async () => {
    const ctx = makeDashboardCtx({
      skills: [
        { name: 'general', path: '/skills/general', description: 'General assistant' },
        { name: 'im-adapter', path: '/skills/im-adapter', description: 'IM guidelines' },
      ],
    });
    const data = await buildDashboardData(ctx);
    const html = renderDashboard(data);
    expect(html).toContain('Skills');
    expect(html).toContain('general');
    expect(html).toContain('im-adapter');
  });

  // ── Escalation panel style tests ─────────────────────────────

  it('renders escalation panel with div-based layout (not table)', async () => {
    const data = await buildDashboardData(makeDashboardCtx());
    data.escalations = [{ ts: '2026-03-15T10:00:00Z', reason: 'Cannot answer', sessionKey: 'sess-1', status: 'open' }];
    const html = renderDashboard(data);
    expect(html).toContain('Escalations');
    expect(html).toContain('escalation-row');
    expect(html).toContain('Cannot answer');
    // Should NOT use table elements
    expect(html).not.toContain('<table');
    expect(html).not.toContain('<thead');
    expect(html).not.toContain('<tbody');
  });

  // ── Fleet peers panel tests ─────────────────────────────

  it('renders fleet peers panel when peers exist', async () => {
    const data = await buildDashboardData(makeDashboardCtx());
    data.fleetPeers = [
      { name: 'bot-a', url: 'http://127.0.0.1:3001', engine: 'cursor', role: 'support', alive: true },
      { name: 'bot-b', url: 'http://127.0.0.1:3002', engine: 'claude-code', alive: false },
    ];
    const html = renderDashboard(data);
    expect(html).toContain('Fleet Peers');
    expect(html).toContain('bot-a');
    expect(html).toContain('bot-b');
    expect(html).toContain('support');
    expect(html).toContain('Dashboard');
  });

  it('omits fleet peers panel when no peers', async () => {
    const data = await buildDashboardData(makeDashboardCtx());
    data.fleetPeers = [];
    const html = renderDashboard(data);
    expect(html).not.toContain('Fleet Peers');
  });
});
