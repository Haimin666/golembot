# Engine Overview

GolemBot supports three Coding Agent engines. All three expose the same `StreamEvent` interface — switching engines requires only a one-line config change.

## Comparison

| | Cursor | Claude Code | OpenCode |
|---|---|---|---|
| Binary | `agent` | `claude` | `opencode` |
| Output format | stream-json | stream-json | NDJSON |
| Skill injection | `.cursor/skills/` | `.claude/skills/` + `CLAUDE.md` | `.opencode/skills/` + `opencode.json` |
| Session resume | `--resume <id>` | `--resume <id>` | `--session <id>` |
| API key env | `CURSOR_API_KEY` | `ANTHROPIC_API_KEY` | Depends on provider |
| Permission bypass | `--force --trust --sandbox disabled` | `--dangerously-skip-permissions` | `opencode.json` permission config |
| Cost tracking | — | `costUsd`, `numTurns` | `costUsd` (accumulated) |

## Unified StreamEvent

Regardless of engine, `assistant.chat()` yields the same event types:

```typescript
type StreamEvent =
  | { type: 'text'; content: string }
  | { type: 'tool_call'; name: string; args: string }
  | { type: 'tool_result'; content: string }
  | { type: 'warning'; message: string }
  | { type: 'error'; message: string }
  | { type: 'done'; sessionId?: string; durationMs?: number;
      costUsd?: number; numTurns?: number };
```

See [StreamEvent](/api/stream-events) for detailed documentation of each type.

## How Engines Work

All engines follow the same pattern:

1. **Inject skills** — symlink skill directories into the engine's expected location
2. **Spawn process** — `child_process.spawn` the engine CLI with the user's message
3. **Parse output** — read stdout line by line, convert to `StreamEvent`
4. **Session management** — pass `--resume` / `--session` flags for multi-turn conversations

The engine is selected by the `engine` field in `golem.yaml`:

```yaml
engine: claude-code   # cursor | claude-code | opencode
```

Or overridden at runtime:

```typescript
const assistant = createAssistant({
  dir: './my-bot',
  engine: 'opencode',  // overrides golem.yaml
});
```

## Choosing an Engine

- **Cursor** — best if you already use Cursor IDE and have a Cursor subscription
- **Claude Code** — first-party Anthropic CLI, provides cost and turn tracking
- **OpenCode** — open-source, supports multiple LLM providers (Anthropic, OpenAI, OpenRouter, etc.)
