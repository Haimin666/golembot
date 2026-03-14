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

Model names are Anthropic model IDs, passed directly as `--model` to the `claude` CLI.

**List available models:**

```bash
claude models
```

**Latest models:**

| Model ID | Alias | Description |
|----------|-------|-------------|
| `claude-opus-4-6` | `claude-opus-4-6` | Most capable, best for complex tasks |
| `claude-sonnet-4-6` | `claude-sonnet-4-6` | Balanced speed and intelligence — recommended |
| `claude-haiku-4-5-20251001` | `claude-haiku-4-5` | Fastest, lightweight |

See the full and up-to-date list at [Anthropic model documentation](https://docs.anthropic.com/en/docs/about-claude/models).

**Override at runtime** — pass `model` to `createAssistant()`:

```typescript
const bot = createAssistant({ dir: './my-bot', model: 'claude-opus-4-6' })
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

## Claude Max Subscription

If you have a Claude Pro or Max subscription (instead of an API key), you can use `claude setup-token` to generate a long-lived OAuth token for headless environments like GolemBot Gateway.

### Setup

1. On a machine with a browser, run:
   ```bash
   claude setup-token
   ```
2. Copy the generated token (valid for 1 year).
3. Add it to your `.env`:
   ```sh
   CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-xxxx...
   ```
4. Reference it in `golem.yaml`:
   ```yaml
   name: my-bot
   engine: claude-code
   oauthToken: ${CLAUDE_CODE_OAUTH_TOKEN}
   ```

### How it works

- GolemBot injects the token via the `CLAUDE_CODE_OAUTH_TOKEN` environment variable when spawning the Claude Code CLI.
- When `oauthToken` is set, it takes precedence over `ANTHROPIC_API_KEY` — they are mutually exclusive.
- Each GolemBot instance can use its own independent token (tokens don't interfere with each other).

### Expiry monitoring

- GolemBot tracks when the token was first used and estimates expiry (first seen + 365 days).
- **30 days before estimated expiry**, a `warning` StreamEvent is emitted on every conversation — IM channels will forward this to admins.
- If an authentication error occurs, GolemBot emits a warning suggesting to run `claude setup-token`.
- `golembot doctor` checks token status and estimated expiry.

::: tip
You can generate multiple setup-tokens for the same account. Logging in elsewhere or generating a new token does **not** invalidate existing ones. Revoke tokens manually at [claude.ai/settings/claude-code](https://claude.ai/settings/claude-code).
:::

## Notes

- The `CLAUDE.md` symlink is the standard way Claude Code discovers project instructions — by pointing it to `AGENTS.md`, the agent sees the full skill list and conventions on startup
- Session resume failures are automatically handled with a fresh session fallback
