/**
 * Slash commands — unified command handling for CLI, HTTP API, and IM Gateway.
 *
 * Commands are parsed and executed here; the caller is responsible for rendering
 * the CommandResult in the appropriate format (terminal, SSE, IM reply, etc.).
 */

import { ensureReady, type GolemConfig, type SkillInfo } from './workspace.js';

// ── Types ────────────────────────────────────────────────

export interface CommandResult {
  /** Human-readable text output (may contain markdown). */
  text: string;
  /** Structured data for JSON consumers (HTTP API --json). */
  data?: Record<string, unknown>;
}

/** Runtime context provided by the caller (gateway / server / CLI). */
export interface CommandContext {
  /** Assistant working directory. */
  dir: string;
  /** Read current runtime config + skills. */
  getStatus: () => Promise<{
    config: GolemConfig;
    skills: SkillInfo[];
    engine: string;
    model: string | undefined;
  }>;
  /** Switch engine at runtime (takes effect on next chat). When clearModel is true, also resets the model. */
  setEngine: (engine: string, clearModel?: boolean) => void;
  /** Switch model at runtime (takes effect on next chat). */
  setModel: (model: string) => void;
  /** Reset the session for the given key. */
  resetSession: (sessionKey?: string) => Promise<void>;
  /** Current session key (for reset). */
  sessionKey?: string;
}

interface ParsedCommand {
  name: string;
  args: string[];
}

// ── Known engines (for validation) ──────────────────────

const KNOWN_ENGINES = ['cursor', 'claude-code', 'opencode', 'codex'];

// ── Parse ────────────────────────────────────────────────

/**
 * Parse a user message into a command. Returns null if the message is not a
 * slash command (i.e. should be forwarded to the agent).
 */
export function parseCommand(text: string): ParsedCommand | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('/')) return null;

  const parts = trimmed.split(/\s+/);
  const name = parts[0].toLowerCase();
  const args = parts.slice(1);

  return { name, args };
}

// ── Execute ──────────────────────────────────────────────

const COMMANDS: Record<string, string> = {
  '/help':    'Show available commands',
  '/status':  'Show current engine, model, and skills',
  '/engine':  'Show or switch engine — /engine [name]',
  '/model':   'Show or switch model — /model [name]',
  '/skill':   'List installed skills',
  '/reset':   'Clear the current session',
};

/**
 * Execute a parsed slash command. Returns a CommandResult with text output
 * and optional structured data.
 *
 * Returns null if the command is not recognized (caller should forward to agent).
 */
export async function executeCommand(
  cmd: ParsedCommand,
  ctx: CommandContext,
): Promise<CommandResult | null> {
  switch (cmd.name) {
    case '/help':
      return cmdHelp();
    case '/status':
      return cmdStatus(ctx);
    case '/engine':
      return cmdEngine(cmd.args, ctx);
    case '/model':
      return cmdModel(cmd.args, ctx);
    case '/skill':
      return cmdSkill(ctx);
    case '/reset':
      return cmdReset(ctx);
    default:
      return null;
  }
}

// ── Command implementations ──────────────────────────────

function cmdHelp(): CommandResult {
  const lines = Object.entries(COMMANDS).map(
    ([cmd, desc]) => `  ${cmd.padEnd(12)} ${desc}`,
  );
  return {
    text: `Available commands:\n${lines.join('\n')}`,
    data: { commands: COMMANDS },
  };
}

async function cmdStatus(ctx: CommandContext): Promise<CommandResult> {
  const { config, skills, engine, model } = await ctx.getStatus();
  const channelNames = config.channels
    ? Object.keys(config.channels).filter(k => !!(config.channels as Record<string, unknown>)[k])
    : [];

  const lines = [
    `Name:      ${config.name}`,
    `Engine:    ${engine}`,
    model ? `Model:     ${model}` : null,
    `Skills:    ${skills.length > 0 ? skills.map(s => s.name).join(', ') : '(none)'}`,
    channelNames.length > 0 ? `Channels:  ${channelNames.join(', ')}` : null,
  ].filter(Boolean);

  return {
    text: lines.join('\n'),
    data: {
      name: config.name,
      engine,
      model: model ?? null,
      skills: skills.map(s => ({ name: s.name, description: s.description })),
      channels: channelNames,
    },
  };
}

async function cmdEngine(args: string[], ctx: CommandContext): Promise<CommandResult> {
  if (args.length === 0) {
    const { engine } = await ctx.getStatus();
    return {
      text: `Current engine: ${engine}\nAvailable: ${KNOWN_ENGINES.join(', ')}\nSwitch: /engine <name>`,
      data: { current: engine, available: KNOWN_ENGINES },
    };
  }

  const target = args[0].toLowerCase();
  if (!KNOWN_ENGINES.includes(target)) {
    return {
      text: `Unknown engine: ${target}\nAvailable: ${KNOWN_ENGINES.join(', ')}`,
      data: { error: 'unknown_engine', available: KNOWN_ENGINES },
    };
  }

  const { model: prevModel } = await ctx.getStatus();
  // Clear model when switching engines — model name formats are engine-specific
  // (e.g. opencode uses "openrouter/anthropic/claude-sonnet-4-5", claude-code uses "claude-sonnet-4-6")
  ctx.setEngine(target, !!prevModel);
  return {
    text: `Engine switched to: ${target} (takes effect on next message)${prevModel ? '\nModel reset to engine default (formats differ between engines)' : ''}`,
    data: { engine: target, modelReset: !!prevModel },
  };
}

async function cmdModel(args: string[], ctx: CommandContext): Promise<CommandResult> {
  if (args.length === 0) {
    const { model, engine } = await ctx.getStatus();
    return {
      text: model
        ? `Current model: ${model} (engine: ${engine})\nSwitch: /model <name>`
        : `No model override (using ${engine} default)\nSwitch: /model <name>`,
      data: { current: model ?? null, engine },
    };
  }

  const target = args.join(' ');
  ctx.setModel(target);
  return {
    text: `Model switched to: ${target} (takes effect on next message)`,
    data: { model: target },
  };
}

async function cmdSkill(ctx: CommandContext): Promise<CommandResult> {
  const { skills } = await ctx.getStatus();
  if (skills.length === 0) {
    return { text: 'No skills installed.', data: { skills: [] } };
  }

  const lines = skills.map(s => `  ${s.name.padEnd(20)} ${s.description}`);
  return {
    text: `Installed skills (${skills.length}):\n${lines.join('\n')}`,
    data: { skills: skills.map(s => ({ name: s.name, description: s.description })) },
  };
}

async function cmdReset(ctx: CommandContext): Promise<CommandResult> {
  await ctx.resetSession(ctx.sessionKey);
  return {
    text: 'Session reset.',
    data: { ok: true },
  };
}
