import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { lstat, mkdir, readdir, symlink, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import type { AgentEngine, InvokeOpts, ListModelsOpts, StreamEvent } from '../engine.js';
import type { ClaudeCodeConfig } from '../workspace.js';
import { claudeProviderEnv } from './provider-env.js';
import { isOnPath } from './shared.js';

// ── stream-json event parsing ───────────────────────────

/**
 * Parse a single NDJSON line from Claude Code's stream-json output.
 *
 * Claude Code uses two layers of JSON wrapping:
 *   1. stream-event layer: {"type":"stream_event","event":{inner_event}}
 *   2. top-level messages:  {"type":"assistant",...} / {"type":"user",...} / {"type":"result",...}
 *
 * This function handles both layers and returns a flat list of StreamEvents.
 */
export function parseClaudeStreamLine(line: string): StreamEvent[] {
  const trimmed = line.trim();
  if (!trimmed || !trimmed.startsWith('{')) return [];

  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(trimmed);
  } catch {
    return [];
  }

  const type = obj.type as string;
  const sessionId = obj.session_id as string | undefined;

  // ── stream_event wrapper ──────────────────────────────
  // Claude Code wraps inner events as {"type":"stream_event","event":{...}}.
  // We must unwrap the inner event to dispatch correctly.
  if (type === 'stream_event') {
    const event = obj.event as Record<string, unknown> | undefined;
    if (!event) return [];
    const innerType = event.type as string;

    if (innerType === 'content_block_delta') {
      const delta = event.delta as Record<string, unknown> | undefined;
      if (!delta) return [];
      const deltaType = delta.type as string;

      if (deltaType === 'text_delta') {
        const text = (delta.text as string) || '';
        if (text) return [{ type: 'text', content: text }];
      }
      if (deltaType === 'thinking_delta') {
        const thinking = (delta.thinking as string) || '';
        if (thinking) {
          if (process.env.GOLEM_VERBOSE === '1' || process.env.GOLEMBOT_VERBOSE === '1') {
            console.error(`[claude-code] thinking_delta event: ${thinking.length} chars`);
          }
          return [{ type: 'thinking', content: thinking }];
        }
      }
      // input_json_delta for tool input streaming — ignore
      return [];
    }

    // message_start, content_block_start, content_block_stop,
    // message_delta, message_stop — no actionable content
    return [];
  }

  // ── system init ───────────────────────────────────────
  // Contains session_id, model, tools, claude_code_version, etc.
  // Not surfaced as StreamEvent, but available for future use.
  if (type === 'system') {
    return [];
  }

  // ── assistant (partial message snapshot) ───────────────
  // With --include-partial-messages, Claude emits these after each content
  // block completes. They contain the full accumulated text/thinking so far.
  // The dedup logic in processBuffer() ensures only new content is emitted.
  if (type === 'assistant') {
    const msg = obj.message as Record<string, unknown> | undefined;
    if (!msg) return [];
    const content = msg.content as Array<Record<string, unknown>> | undefined;
    if (!Array.isArray(content)) return [];

    const events: StreamEvent[] = [];
    for (const block of content) {
      if (block.type === 'text') {
        const text = (block.text as string) || '';
        if (text) events.push({ type: 'text', content: text });
      } else if (block.type === 'thinking') {
        const thinking = (block.thinking as string) || '';
        if (thinking) events.push({ type: 'thinking', content: thinking });
      } else if (block.type === 'tool_use') {
        const name = (block.name as string) || 'unknown';
        const input = block.input ?? {};
        events.push({ type: 'tool_call', name, args: JSON.stringify(input) });
      }
    }
    return events;
  }

  // ── user (tool results) ───────────────────────────────
  if (type === 'user') {
    const msg = obj.message as Record<string, unknown> | undefined;
    if (!msg) return [];
    const content = msg.content as Array<Record<string, unknown>> | undefined;
    if (!Array.isArray(content)) return [];

    const events: StreamEvent[] = [];
    for (const block of content) {
      if (block.type === 'tool_result') {
        let resultContent: string;
        if (typeof block.content === 'string') {
          resultContent = block.content;
        } else if (Array.isArray(block.content)) {
          resultContent = (block.content as Array<Record<string, unknown>>)
            .filter((b) => b.type === 'text')
            .map((b) => (b.text as string) || '')
            .join('\n');
        } else {
          resultContent = '';
        }
        events.push({ type: 'tool_result', content: resultContent });
      }
    }
    return events;
  }

  // ── result (terminal) ─────────────────────────────────
  if (type === 'result') {
    const isError = obj.is_error as boolean;
    if (isError) {
      const errors = Array.isArray(obj.errors)
        ? (obj.errors as unknown[]).map((e) => (typeof e === 'string' ? e : '')).filter((e) => e.trim().length > 0)
        : [];
      const message =
        (obj.result as string) ||
        (obj.error as string) ||
        (errors.length > 0 ? errors.join(' | ') : '') ||
        'Agent error';
      return [{ type: 'error', message }];
    }
    const durationMs = typeof obj.duration_ms === 'number' ? obj.duration_ms : undefined;
    const costUsd = typeof obj.total_cost_usd === 'number' ? obj.total_cost_usd : undefined;
    const numTurns = typeof obj.num_turns === 'number' ? obj.num_turns : undefined;
    const fullText = typeof obj.result === 'string' && obj.result ? obj.result : undefined;
    if (process.env.GOLEM_VERBOSE === '1' || process.env.GOLEMBOT_VERBOSE === '1') {
      console.error(
        `[claude-code] result event: fullText=${fullText?.length || 0} chars, result type=${typeof obj.result}`,
      );
    }
    return [{ type: 'done', sessionId, durationMs, costUsd, numTurns, fullText }];
  }

  return [];
}

// ── Skill injection ──────────────────────────────────────

export async function injectClaudeSkills(
  workspace: string,
  skillPaths: string[],
  _skillDescriptions?: Array<{ name: string; description: string }>,
): Promise<void> {
  const claudeSkillsDir = join(workspace, '.claude', 'skills');
  await mkdir(claudeSkillsDir, { recursive: true });

  try {
    const existing = await readdir(claudeSkillsDir);
    for (const entry of existing) {
      const full = join(claudeSkillsDir, entry);
      const s = await lstat(full).catch(() => null);
      if (s?.isSymbolicLink()) {
        await unlink(full);
      }
    }
  } catch {
    // directory might not exist yet
  }

  for (const sp of skillPaths) {
    const name = basename(sp);
    const dest = join(claudeSkillsDir, name);
    try {
      await symlink(resolve(sp), dest);
    } catch (e: unknown) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
    }
  }

  // Symlink CLAUDE.md → AGENTS.md to avoid maintaining duplicate content
  const claudeMdPath = join(workspace, 'CLAUDE.md');
  try {
    const existing = await lstat(claudeMdPath).catch(() => null);
    if (existing) await unlink(claudeMdPath);
  } catch {
    /* doesn't exist yet */
  }
  try {
    await symlink('AGENTS.md', claudeMdPath);
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
  }
}

// ── Engine ───────────────────────────────────────────────

let _warnedSkipPermissions = false;

function findClaudeBin(): string {
  const localBin = join(homedir(), '.local', 'bin', 'claude');
  if (!existsSync(localBin) && !isOnPath('claude')) {
    throw new Error(
      `Claude Code CLI ("claude") not found at ${localBin}\n` +
        `Install it with: npm install -g @anthropic-ai/claude-code\n` +
        `See: https://code.claude.com/docs/en/overview`,
    );
  }
  return existsSync(localBin) ? localBin : 'claude';
}

/**
 * Apply claudeCode config to CLI args.
 * Supports both structured config fields and arbitrary extra flags.
 */
function applyClaudeCodeFlags(args: string[], config: ClaudeCodeConfig): void {
  // --effort flag (low, medium, high)
  if (config.effort) {
    args.push('--effort', config.effort);
  }
  // --max-turns flag
  if (config.maxTurns !== undefined) {
    args.push('--max-turns', String(config.maxTurns));
  }
  // --working-context flag (as percentage)
  if (config.workingContext !== undefined) {
    args.push('--working-context', String(config.workingContext));
  }
  // Extra flags - pass through arbitrary CLI flags
  if (config.extraFlags) {
    for (const [flag, value] of Object.entries(config.extraFlags)) {
      const flagName = flag.startsWith('--') ? flag : `--${flag}`;
      if (value === true) {
        args.push(flagName);
      } else if (value === false) {
        // Boolean false - skip this flag
      } else {
        args.push(flagName, value);
      }
    }
  }
}

export class ClaudeCodeEngine implements AgentEngine {
  async *invoke(prompt: string, opts: InvokeOpts): AsyncIterable<StreamEvent> {
    await injectClaudeSkills(opts.workspace, opts.skillPaths);

    if (opts.mcpConfig && Object.keys(opts.mcpConfig).length > 0) {
      const claudeDir = join(opts.workspace, '.claude');
      await mkdir(claudeDir, { recursive: true });
      const mcpServers: Record<string, unknown> = {};
      for (const [name, cfg] of Object.entries(opts.mcpConfig)) {
        mcpServers[name] = { command: cfg.command, args: cfg.args, env: cfg.env };
      }
      await writeFile(join(claudeDir, 'mcp.json'), `${JSON.stringify({ mcpServers }, null, 2)}\n`, 'utf-8');
    }

    const claudeBin = findClaudeBin();
    const args = ['-p', prompt, '--output-format', 'stream-json', '--verbose', '--include-partial-messages'];

    // Resolve skipPermissions: claudeCode config takes precedence, then global config
    const skipPerms = opts.claudeCode?.skipPermissions ?? opts.skipPermissions;
    if (skipPerms !== false) {
      args.push('--dangerously-skip-permissions');
      if (!_warnedSkipPermissions) {
        _warnedSkipPermissions = true;
        process.stderr.write(
          '\x1b[33mWarning: running Claude Code with --dangerously-skip-permissions. ' +
            'Set skipPermissions: false in golem.yaml to require manual approval.\x1b[0m\n',
        );
      }
    }
    if (opts.sessionId) args.push('--resume', opts.sessionId);
    // In provider mode, exclude user-level Claude settings (e.g.
    // ~/.claude/settings.json apiKeyHelper / env overrides) so injected
    // provider env vars are authoritative.
    if (opts.provider) args.push('--setting-sources', 'project,local');
    // When a custom provider is configured, the model is set via ANTHROPIC_MODEL
    // env var instead of --model flag (which triggers client-side validation
    // against Anthropic's model list and rejects third-party model names).
    if (opts.model && !opts.provider) args.push('--model', opts.model);

    // Apply claudeCode-specific flags
    if (opts.claudeCode) {
      applyClaudeCodeFlags(args, opts.claudeCode);
    }

    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      PATH: `${join(homedir(), '.local', 'bin')}:${process.env.PATH || ''}`,
    };
    if (opts.provider) Object.assign(env, claudeProviderEnv(opts.provider));
    // When provider is set but provider.model is not, the resolved model (from
    // modelOverride or config.model) must still be communicated via env var,
    // since --model flag is suppressed in provider mode.
    if (opts.provider && opts.model && !env.ANTHROPIC_MODEL) {
      env.ANTHROPIC_MODEL = opts.model;
    }
    if (opts.oauthToken) {
      env.CLAUDE_CODE_OAUTH_TOKEN = opts.oauthToken;
      // OAuth token and API key are mutually exclusive; OAuth takes precedence
      delete env.ANTHROPIC_API_KEY;
    } else if (opts.apiKey) env.ANTHROPIC_API_KEY = opts.apiKey;
    // Allow spawning Claude Code from within a Claude Code session
    delete env.CLAUDECODE;
    delete env.CLAUDE_CODE_ENTRYPOINT;

    // Log the full command in verbose mode
    if (process.env.GOLEM_VERBOSE === '1' || process.env.GOLEMBOT_VERBOSE === '1') {
      const cmdStr = `${claudeBin} ${args.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ')}`;
      console.error(`[claude-code] Invoking: ${cmdStr}`);
    }

    const child = spawn(claudeBin, args, {
      cwd: opts.workspace,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stderrTail: string[] = [];

    const queue: Array<StreamEvent | null> = [];
    let resolver: (() => void) | null = null;
    let buffer = '';

    // ── Text / thinking deduplication ────────────────────
    // Claude Code emits TWO sources of text for the same content:
    //   1. content_block_delta (stream_event) — true incremental token deltas
    //   2. assistant (partial message) — full accumulated snapshot
    // We track the accumulated text/thinking and suppress redundant snapshots.
    // - True deltas: each chunk is new text → always emit, append to accum
    // - Snapshots: fullText starts with accum → emit only the new tail (if any)
    let textDedupAccum = '';
    let thinkingDedupAccum = '';

    function enqueue(evt: StreamEvent | null) {
      queue.push(evt);
      if (resolver) {
        resolver();
        resolver = null;
      }
    }

    function processBuffer() {
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        const events = parseClaudeStreamLine(line);

        // Collect events by type for deduplication
        const textParts: string[] = [];
        const thinkingParts: string[] = [];
        const otherEvents: StreamEvent[] = [];
        for (const evt of events) {
          if (evt.type === 'text') {
            textParts.push(evt.content);
          } else if (evt.type === 'thinking') {
            thinkingParts.push(evt.content);
          } else {
            otherEvents.push(evt);
          }
        }

        // ── Dedup thinking ──
        if (thinkingParts.length > 0) {
          const fullThinking = thinkingParts.join('');
          if (thinkingDedupAccum && fullThinking.startsWith(thinkingDedupAccum)) {
            // Accumulated snapshot (from assistant partial message).
            // Emit only the new tail that hasn't been streamed yet.
            if (fullThinking.length > thinkingDedupAccum.length) {
              const delta = fullThinking.slice(thinkingDedupAccum.length);
              thinkingDedupAccum = fullThinking;
              if (delta) enqueue({ type: 'thinking', content: delta });
            }
            // else: exact match — nothing new, skip
          } else {
            // True delta (from content_block_delta) or first thinking or new turn.
            // Emit as-is and append to accum.
            thinkingDedupAccum += fullThinking;
            if (fullThinking) enqueue({ type: 'thinking', content: fullThinking });
          }
        }

        // ── Dedup text ──
        if (textParts.length > 0) {
          const fullText = textParts.join('');
          if (textDedupAccum && fullText.startsWith(textDedupAccum)) {
            // Accumulated snapshot (from assistant partial message).
            // Emit only the new tail that hasn't been streamed yet.
            if (fullText.length > textDedupAccum.length) {
              const delta = fullText.slice(textDedupAccum.length);
              textDedupAccum = fullText;
              if (delta) enqueue({ type: 'text', content: delta });
            }
            // else: exact match — nothing new, skip
          } else {
            // True delta (from content_block_delta) or first text or new turn.
            // Emit as-is and append to accum.
            textDedupAccum += fullText;
            if (fullText) enqueue({ type: 'text', content: fullText });
          }
        }

        // ── Other events (tool_call, tool_result, done, error) ──
        for (const evt of otherEvents) {
          // After a tool_result, subsequent text/thinking will be from a new
          // assistant turn — reset dedup accumulators so new content is not
          // treated as duplicate.
          if (evt.type === 'tool_result') {
            textDedupAccum = '';
            thinkingDedupAccum = '';
          }
          enqueue(evt);
        }
      }
    }

    if (opts.signal) {
      const abortHandler = () => {
        try {
          child.kill();
        } catch {
          /* already dead */
        }
        enqueue({ type: 'error', message: 'Agent invocation timed out' });
        enqueue(null);
      };
      opts.signal.addEventListener('abort', abortHandler, { once: true });
      child.once('close', () => opts.signal!.removeEventListener('abort', abortHandler));
    }

    child.stdout!.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      processBuffer();
    });

    child.stderr!.on('data', (chunk: Buffer) => {
      const raw = chunk.toString();
      for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        stderrTail.push(trimmed);
        if (stderrTail.length > 20) stderrTail.shift();
      }
    });

    child.on('close', (exitCode: number | null) => {
      if (buffer.trim()) {
        buffer += '\n';
        processBuffer();
      }
      const code = exitCode ?? 1;
      if (code !== 0 && !queue.some((e) => e && (e.type === 'done' || e.type === 'error'))) {
        const tail = stderrTail.length > 0 ? `; stderr: ${stderrTail.join(' | ')}` : '';
        enqueue({ type: 'error', message: `Claude Code process exited with code ${code}${tail}` });
      }
      enqueue(null);
    });

    child.on('error', (err: Error) => {
      enqueue({ type: 'error', message: `Failed to start Claude Code: ${err.message}` });
      enqueue(null);
    });

    while (true) {
      if (queue.length === 0)
        await new Promise<void>((r) => {
          resolver = r;
        });
      while (queue.length > 0) {
        const evt = queue.shift()!;
        if (evt === null) return;
        yield evt;
        if (evt.type === 'done' || evt.type === 'error') {
          try {
            child.kill();
          } catch {
            /* already dead */
          }
          return;
        }
      }
    }
  }

  async listModels(opts: ListModelsOpts): Promise<string[]> {
    const apiKey = opts.apiKey || process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
      try {
        const resp = await fetch('https://api.anthropic.com/v1/models?limit=100', {
          headers: { 'anthropic-version': '2023-06-01', 'x-api-key': apiKey },
          signal: AbortSignal.timeout(10_000),
        });
        const data = (await resp.json()) as { data?: Array<{ id: string }> };
        if (data.data?.length) return data.data.map((m) => m.id).sort();
      } catch {
        /* fallback below */
      }
    }
    return ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'];
  }
}
