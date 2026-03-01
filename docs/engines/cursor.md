# Cursor Engine

The Cursor engine invokes Cursor's `agent` CLI to handle conversations.

## Prerequisites

- Install the `agent` CLI: `~/.local/bin/agent` or available on PATH
- Set `CURSOR_API_KEY` environment variable

## Configuration

```yaml
# golem.yaml
name: my-bot
engine: cursor
model: claude-sonnet   # optional
```

## How It Works

### CLI Invocation

```bash
agent -p "<prompt>" \
  --output-format stream-json \
  --stream-partial-output \
  --force --trust --sandbox disabled \
  --approve-mcps \
  --workspace <dir>
```

Optional flags added when available:
- `--resume <sessionId>` — resume a previous session
- `--model <model>` — specify model
- `--api-key <key>` — API key (can also use `CURSOR_API_KEY` env)

### Skill Injection

Skills are symlinked into `.cursor/skills/` inside the workspace:

```
my-bot/
├── .cursor/
│   └── skills/
│       ├── general -> ../../skills/general
│       └── im-adapter -> ../../skills/im-adapter
└── skills/
    ├── general/
    └── im-adapter/
```

Old symlinks are cleaned up before each invocation.

### Output Parsing

Cursor emits stream-json events with ANSI escape codes. GolemBot:

1. Strips ANSI codes from each line
2. Parses JSON events (`assistant`, `tool_call`, `result` types)
3. Applies **segment accumulation dedup** — Cursor emits character-level deltas followed by a summary; the summary is dropped if it matches the accumulated text

### Session Resume

Sessions are automatically resumed using `--resume <sessionId>`. If resume fails (engine-side expiration), GolemBot automatically starts a new session.

## Notes

- The `--force --trust --sandbox disabled` flags bypass Cursor's permission system for automated operation
- `--approve-mcps` auto-approves MCP server connections
- `--stream-partial-output` enables real-time streaming (required for the dedup logic)
