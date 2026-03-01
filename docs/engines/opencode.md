# OpenCode Engine

The OpenCode engine invokes the `opencode` CLI, which supports multiple LLM providers.

## Prerequisites

- Install OpenCode: `opencode` available on PATH
- Set the API key for your chosen provider (see below)

## Configuration

```yaml
# golem.yaml
name: my-bot
engine: opencode
model: anthropic/claude-sonnet   # optional, provider/model format
```

## How It Works

### CLI Invocation

```bash
opencode run "<prompt>" \
  --format json
```

Optional flags:
- `--session <sessionId>` — resume a previous session
- `--model <provider/model>` — specify model

### Multi-Provider Support

OpenCode supports many LLM providers. GolemBot automatically resolves the correct API key environment variable based on the model prefix:

| Model prefix | Environment variable |
|-------------|---------------------|
| `anthropic/` | `ANTHROPIC_API_KEY` |
| `openai/` | `OPENAI_API_KEY` |
| `openrouter/` | `OPENROUTER_API_KEY` |
| `groq/` | `GROQ_API_KEY` |
| `azure/` | `AZURE_API_KEY` |
| (others) | Passed through as-is |

If you pass `apiKey` via `createAssistant()`, GolemBot infers the correct env var name from the model prefix.

### Skill Injection

Skills are symlinked into `.opencode/skills/`:

```
my-bot/
├── .opencode/
│   └── skills/
│       ├── general -> ../../skills/general
│       └── im-adapter -> ../../skills/im-adapter
├── opencode.json
└── skills/
    ├── general/
    └── im-adapter/
```

Additionally, GolemBot writes or updates `opencode.json` with permission and model configuration:

```json
{
  "permission": { "*": "allow" },
  "model": "anthropic/claude-sonnet"
}
```

### Output Parsing

OpenCode emits NDJSON (`--format json`). The parser handles:

- `text` events — streamed text content
- `tool_use` events — tool invocations
- `step_finish` events — accumulated per-step (not emitted individually); cost is summed
- `error` events — from both stdout and stderr

A single `done` event is emitted when the process closes, with accumulated cost.

### Session Resume

Sessions use `--session <ses_xxx>` format. Like other engines, resume failures trigger an automatic fallback to a fresh session.

## Notes

- OpenCode is the most flexible engine in terms of provider support
- The `opencode.json` permission config (`"*": "allow"`) bypasses all permission prompts for automated operation
- Cost tracking aggregates across all steps in a conversation turn
