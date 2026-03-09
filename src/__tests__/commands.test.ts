import { describe, it, expect, vi } from 'vitest';
import { parseCommand, executeCommand, type CommandContext } from '../commands.js';

// ── parseCommand ─────────────────────────────────────────

describe('parseCommand', () => {
  it('returns null for non-command text', () => {
    expect(parseCommand('hello world')).toBeNull();
    expect(parseCommand('  just a message  ')).toBeNull();
    expect(parseCommand('')).toBeNull();
  });

  it('parses simple command', () => {
    expect(parseCommand('/help')).toEqual({ name: '/help', args: [] });
  });

  it('parses command with args', () => {
    expect(parseCommand('/engine claude-code')).toEqual({ name: '/engine', args: ['claude-code'] });
  });

  it('parses command with multiple args', () => {
    expect(parseCommand('/model claude-sonnet-4-6')).toEqual({ name: '/model', args: ['claude-sonnet-4-6'] });
  });

  it('normalizes command name to lowercase', () => {
    expect(parseCommand('/HELP')).toEqual({ name: '/help', args: [] });
    expect(parseCommand('/Engine Cursor')).toEqual({ name: '/engine', args: ['Cursor'] });
  });

  it('handles extra whitespace', () => {
    expect(parseCommand('  /help  ')).toEqual({ name: '/help', args: [] });
    expect(parseCommand('/engine   cursor  ')).toEqual({ name: '/engine', args: ['cursor'] });
  });
});

// ── executeCommand ───────────────────────────────────────

function makeCtx(overrides?: Partial<CommandContext>): CommandContext {
  return {
    dir: '/tmp/test',
    sessionKey: 'test-session',
    getStatus: async () => ({
      config: { name: 'my-bot', engine: 'cursor', model: 'sonnet-4.6' } as any,
      skills: [
        { name: 'general', path: '/tmp/skills/general', description: 'General assistant' },
        { name: 'faq', path: '/tmp/skills/faq', description: 'FAQ support' },
      ],
      engine: 'cursor',
      model: 'sonnet-4.6',
    }),
    setEngine: vi.fn(),
    setModel: vi.fn(),
    resetSession: vi.fn(),
    ...overrides,
  };
}

describe('executeCommand', () => {
  // ── /help ──
  it('/help returns command list', async () => {
    const result = await executeCommand({ name: '/help', args: [] }, makeCtx());
    expect(result).not.toBeNull();
    expect(result!.text).toContain('/help');
    expect(result!.text).toContain('/status');
    expect(result!.text).toContain('/engine');
    expect(result!.text).toContain('/model');
    expect(result!.text).toContain('/skill');
    expect(result!.text).toContain('/reset');
    expect(result!.data).toHaveProperty('commands');
  });

  // ── /status ──
  it('/status shows current config', async () => {
    const result = await executeCommand({ name: '/status', args: [] }, makeCtx());
    expect(result).not.toBeNull();
    expect(result!.text).toContain('my-bot');
    expect(result!.text).toContain('cursor');
    expect(result!.text).toContain('sonnet-4.6');
    expect(result!.data!.engine).toBe('cursor');
    expect(result!.data!.model).toBe('sonnet-4.6');
  });

  // ── /engine ──
  it('/engine without args shows current engine', async () => {
    const result = await executeCommand({ name: '/engine', args: [] }, makeCtx());
    expect(result!.text).toContain('cursor');
    expect(result!.text).toContain('Available');
  });

  it('/engine with valid name switches engine', async () => {
    const ctx = makeCtx();
    const result = await executeCommand({ name: '/engine', args: ['claude-code'] }, ctx);
    expect(result!.text).toContain('claude-code');
    expect(result!.text).toContain('switched');
    expect(ctx.setEngine).toHaveBeenCalledWith('claude-code');
  });

  it('/engine with invalid name returns error', async () => {
    const ctx = makeCtx();
    const result = await executeCommand({ name: '/engine', args: ['invalid'] }, ctx);
    expect(result!.text).toContain('Unknown engine');
    expect(ctx.setEngine).not.toHaveBeenCalled();
  });

  // ── /model ──
  it('/model without args shows current model', async () => {
    const result = await executeCommand({ name: '/model', args: [] }, makeCtx());
    expect(result!.text).toContain('sonnet-4.6');
  });

  it('/model without args and no model set', async () => {
    const ctx = makeCtx({
      getStatus: async () => ({
        config: { name: 'bot', engine: 'cursor' } as any,
        skills: [],
        engine: 'cursor',
        model: undefined,
      }),
    });
    const result = await executeCommand({ name: '/model', args: [] }, ctx);
    expect(result!.text).toContain('No model override');
  });

  it('/model with args switches model', async () => {
    const ctx = makeCtx();
    const result = await executeCommand({ name: '/model', args: ['claude-sonnet-4-6'] }, ctx);
    expect(result!.text).toContain('claude-sonnet-4-6');
    expect(ctx.setModel).toHaveBeenCalledWith('claude-sonnet-4-6');
  });

  // ── /skill ──
  it('/skill lists installed skills', async () => {
    const result = await executeCommand({ name: '/skill', args: [] }, makeCtx());
    expect(result!.text).toContain('general');
    expect(result!.text).toContain('faq');
    expect(result!.data!.skills).toHaveLength(2);
  });

  it('/skill with no skills', async () => {
    const ctx = makeCtx({
      getStatus: async () => ({
        config: { name: 'bot', engine: 'cursor' } as any,
        skills: [],
        engine: 'cursor',
        model: undefined,
      }),
    });
    const result = await executeCommand({ name: '/skill', args: [] }, ctx);
    expect(result!.text).toContain('No skills');
  });

  // ── /reset ──
  it('/reset clears session', async () => {
    const ctx = makeCtx();
    const result = await executeCommand({ name: '/reset', args: [] }, ctx);
    expect(result!.text).toContain('Session reset');
    expect(ctx.resetSession).toHaveBeenCalledWith('test-session');
  });

  // ── Unknown command ──
  it('unknown command returns null', async () => {
    const result = await executeCommand({ name: '/unknown', args: [] }, makeCtx());
    expect(result).toBeNull();
  });
});
