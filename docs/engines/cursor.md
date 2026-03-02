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
model: claude-sonnet-4-5   # optional, see below
```

## Choosing a Model

Cursor manages its own model list — the names do **not** follow Anthropic's or OpenAI's naming conventions directly.

**How to find available model names:**

1. Open Cursor → Settings → Models — the exact identifier shown there is what you put in `model`.
2. Or check the [Cursor model documentation](https://docs.cursor.com/settings/models).

**Common values:**

| Model | Notes |
|-------|-------|
| `claude-sonnet-4-5` | Anthropic Claude Sonnet (via Cursor) |
| `gpt-4o` | OpenAI GPT-4o |
| `o3-mini` | OpenAI o3-mini |
| `gemini-2.5-pro` | Google Gemini 2.5 Pro |

If `model` is omitted, Cursor uses its default model (configured in Cursor settings).

**Override at runtime** — pass `model` to `createAssistant()`:

```typescript
const bot = createAssistant({ dir: './my-bot', model: 'gpt-4o' })
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
