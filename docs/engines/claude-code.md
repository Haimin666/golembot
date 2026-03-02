# Claude Code Engine

The Claude Code engine invokes Anthropic's `claude` CLI.

## Prerequisites

- Install Claude Code: `~/.local/bin/claude` or available on PATH
- Authenticate: `claude auth login` or set `ANTHROPIC_API_KEY` environment variable

## Configuration

```yaml
# golem.yaml
name: my-bot
engine: claude-code
model: claude-sonnet-4-6   # optional, see below
skipPermissions: true       # default: true
```

## Choosing a Model

Model names are Anthropic's model IDs, passed directly as `--model` to the `claude` CLI.

**List available models:**

```bash
claude models
```

**Current models (as of 2025):**

| Model | Description |
|-------|-------------|
| `claude-opus-4-5` | Most capable, slower |
| `claude-sonnet-4-6` | Balanced — recommended default |
| `claude-haiku-4-5-20251001` | Fast and lightweight |

See the full list at [Anthropic model documentation](https://docs.anthropic.com/en/docs/about-claude/models).

**Override at runtime** — pass `model` to `createAssistant()`:

```typescript
const bot = createAssistant({ dir: './my-bot', model: 'claude-opus-4-5' })
```

## How It Works

### CLI Invocation

```bash
claude -p "<prompt>" \
  --output-format stream-json \
  --verbose \
  --dangerously-skip-permissions
```

Optional flags:
- `--resume <sessionId>` — resume a previous session
- `--model <model>` — specify model

The `--verbose` flag is required for intermediate stream events (tool calls, tool results).

### Permission Bypass

`skipPermissions` defaults to `true`. When enabled, `--dangerously-skip-permissions` is passed to the CLI. A one-time warning is emitted to stderr. Set `skipPermissions: false` in `golem.yaml` to disable this behavior (the agent will prompt for permission on certain actions).

### Skill Injection

Skills are symlinked into `.claude/skills/`:

```
my-bot/
├── .claude/
│   └── skills/
│       ├── general -> ../../skills/general
│       └── im-adapter -> ../../skills/im-adapter
├── CLAUDE.md -> AGENTS.md
└── skills/
    ├── general/
    └── im-adapter/
```

Additionally, `CLAUDE.md` is created as a symlink to `AGENTS.md`, allowing Claude Code to read the auto-generated assistant context.

### Output Parsing

Claude Code emits clean JSON (no ANSI codes). The parser handles:

- `assistant` messages — text content blocks and `tool_use` blocks
- `user` messages — `tool_result` blocks
- `result` messages — final result with `costUsd` (`total_cost_usd`) and `numTurns` (`num_turns`)

### Cost & Turn Tracking

Claude Code is the only engine that provides per-conversation cost and turn count in the `done` event:

```typescript
{ type: 'done', sessionId: '...', durationMs: 12345,
  costUsd: 0.042, numTurns: 3 }
```

### Environment

GolemBot deletes `CLAUDECODE` and `CLAUDE_CODE_ENTRYPOINT` environment variables before spawning, to allow nested invocations of Claude Code.

## Notes

- The `CLAUDE.md` symlink is the standard way Claude Code discovers project instructions — by pointing it to `AGENTS.md`, the agent sees the full skill list and conventions on startup
- Session resume failures are automatically handled with a fresh session fallback
