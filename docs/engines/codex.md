# Codex Engine

The Codex engine invokes the OpenAI `codex` CLI (`@openai/codex`), which uses OpenAI models to autonomously complete tasks.

## Prerequisites

- Install Codex: `npm install -g @openai/codex`
- Set `OPENAI_API_KEY` environment variable

## Configuration

```yaml
# golem.yaml
name: my-bot
engine: codex
model: codex-mini-latest   # optional
```

## Choosing a Model

**List available models:**

```bash
codex models
```

**Common models:**

| Model | Description |
|-------|-------------|
| `codex-mini-latest` | Fast, cost-efficient coding model (default) |
| `o4-mini` | OpenAI o4-mini reasoning model |

**Override at runtime** — pass `model` to `createAssistant()`:

```typescript
const bot = createAssistant({ dir: './my-bot', model: 'o4-mini' })
```

## Authentication

```bash
# Local development
export OPENAI_API_KEY=sk-...

# Or use codex login
codex login --with-api-key sk-...
```

For CI/CD, set `OPENAI_API_KEY` as an environment variable or pass `apiKey` to `createAssistant()`.

## How It Works

### CLI Invocation

```bash
codex exec --json --full-auto "<prompt>"
```

Optional flags:
- `--model <name>` — specify model
- `resume <thread_id>` — resume a previous session

### Skill Injection

Codex discovers skills via `AGENTS.md` at the workspace root. GolemBot generates this file automatically from your `skills/` directory — no additional setup is needed.

```
my-bot/
├── AGENTS.md          # auto-generated, lists all skill descriptions
└── skills/
    ├── general/
    └── im-adapter/
```

### Output Parsing

Codex emits NDJSON (`--json`). The parser handles:

- `thread.started` — captures `thread_id` for session resume (not emitted to consumer)
- `item.completed` with `agent_message` — text content
- `item.completed` with `command_execution` — tool call + tool result
- `turn.completed` — emits the `done` event with `sessionId`
- `turn.failed` — emits an `error` event
- Top-level `error` — emits an `error` event

### Session Resume

The `thread_id` from `thread.started` is used as `sessionId`. On the next turn:

```bash
codex exec --json --full-auto resume <thread_id> "<prompt>"
```

## Notes

- `--full-auto` disables interactive permission prompts — required for headless operation
- Skills are discovered via `AGENTS.md` at the workspace root (same file used by Claude Code)
- Unlike other engines, Codex does not provide cost/token tracking in the `done` event
