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
});
