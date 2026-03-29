# Codex Engine

The Codex engine invokes the OpenAI `codex` CLI (`@openai/codex`), which uses OpenAI models to autonomously complete tasks.

## Prerequisites

- Install Codex: `npm install -g @openai/codex`
- Authenticate (choose one):
  - **ChatGPT OAuth** — `codex login` (for ChatGPT Plus/Pro/Team/Enterprise subscribers)
  - **API key** — set `OPENAI_API_KEY` environment variable

## Configuration

```yaml
# golem.yaml
name: my-bot
engine: codex
codex:
  mode: unrestricted  # compatibility alias; see fine-grained settings below
  search: true
# model: o4-mini   # optional; omit when using ChatGPT OAuth
```

## Authentication

Codex supports two authentication modes:

### ChatGPT OAuth (browser login)

For ChatGPT Plus / Pro / Team / Enterprise subscribers:

```bash
codex login    # opens browser; credentials stored in ~/.codex/auth.json
```

GolemBot automatically uses the stored credentials — no extra configuration needed.

> **Model compatibility:** `codex-mini-latest` is only available in API key mode. When using ChatGPT OAuth, leave `model` unset in `golem.yaml` so Codex selects the appropriate model for your subscription automatically.

### API Key

For CI/CD, scripts, or programmatic access:

```bash
export CODEX_API_KEY=sk-...          # primary env var for Codex CLI (per official CI docs)
# OPENAI_API_KEY is also accepted for compatibility with older versions

# Or pre-login with the key (stored in ~/.codex/auth.json):
printenv CODEX_API_KEY | codex login --with-api-key
```

Pass via `createAssistant()` or `golem.yaml`:

```typescript
const bot = createAssistant({ dir: './my-bot', apiKey: process.env.CODEX_API_KEY })
```

## Choosing a Model

**List available models:**

```bash
codex models
```

**Common models (API key mode):**

| Model | Description |
|-------|-------------|
| `5.3-codex` | Latest full-size Codex model (visible to API users since Feb 2026) |
| `codex-mini-latest` | Fast, cost-efficient coding model (o4-mini-based) |
| `codex-1` | Original o3-based release model |

**Override at runtime** — pass `model` to `createAssistant()`:

```typescript
const bot = createAssistant({ dir: './my-bot', model: 'o4-mini' })
```

## Runtime Controls

GolemBot supports both a shorthand `mode` and fine-grained Codex execution settings:

```yaml
engine: codex
codex:
  mode: unrestricted     # optional shorthand: unrestricted | safe
  sandbox: workspace-write
  approval: on-request
  search: false
  addDirs:
    - ../shared-assets
```

Shorthand modes:

| Mode | CLI flags | Behavior |
|------|-----------|----------|
| `unrestricted` | `--dangerously-bypass-approvals-and-sandbox` | No sandbox, no approval prompts. Intended for externally sandboxed environments |
| `safe` | `--full-auto` | Automatic execution inside Codex's `workspace-write` sandbox |

Fine-grained fields:

| Field | CLI flag | Description |
|------|----------|-------------|
| `sandbox` | `--sandbox <mode>` | `read-only`, `workspace-write`, or `danger-full-access` |
| `approval` | `--ask-for-approval <policy>` | `untrusted`, `on-request`, or `never` (passed as a top-level Codex CLI flag before `exec`) |
| `search` | `--search` | Enables Codex's live web search tool (passed before `exec`) |
| `addDirs` | `--add-dir <path>` | Adds extra writable directories alongside the workspace |

Precedence:

- If `codex.sandbox` or `codex.approval` is set, GolemBot passes explicit `--sandbox` / `--ask-for-approval` flags and does not use the `mode` alias.
- When only one of `sandbox` or `approval` is set, the other defaults to `workspace-write` / `on-request`.
- If neither is set, GolemBot falls back to `mode`, which defaults to `unrestricted`.
- `approval` and `search` are emitted as top-level Codex CLI flags before `exec`; `sandbox`, `addDirs`, and `image` stay on the `exec` subcommand.

## How It Works

### CLI Invocation

GolemBot calls the Codex CLI in headless mode:

```bash
# New session
codex exec --json --dangerously-bypass-approvals-and-sandbox --skip-git-repo-check "<prompt>"

# Resume session
codex exec resume --json --dangerously-bypass-approvals-and-sandbox --skip-git-repo-check <thread_id> "<prompt>"
```

Flags used:

| Flag | Purpose |
|------|---------|
| `--json` | NDJSON output, required for stream parsing |
| `--dangerously-bypass-approvals-and-sandbox` | Default `unrestricted` mode: disables prompts and sandboxing |
| `--full-auto` | `safe` mode: disables prompts but keeps Codex sandboxed |
| `--sandbox <mode>` / `--ask-for-approval <policy>` | Fine-grained execution control when `codex.sandbox` / `codex.approval` are configured (`--ask-for-approval` is passed before `exec`) |
| `--search` | Enables live web search (passed before `exec`) |
| `--image <path>` | Attaches an input image to the prompt |
| `--add-dir <path>` | Adds extra writable directories |
| `--skip-git-repo-check` | Allows running outside a Git repository (temp dirs, CI workspaces) |
| `--model <name>` | Override model (API key mode only) |

### Images and Search

When users send image attachments through GolemBot, the Codex engine now forwards them with `--image <path>`. If `codex.search: true` is enabled, GolemBot also passes `--search` so Codex can use live web search during the turn.

### Skill Injection

GolemBot injects skills into Codex via two mechanisms:

1. **`.agents/skills/` symlinks** — each skill directory is symlinked to `.agents/skills/<name>`, matching Codex's native skill discovery (progressive disclosure)
2. **`AGENTS.md`** — auto-generated at the workspace root with skill descriptions and project instructions

```
my-bot/
├── AGENTS.md          # auto-generated, lists all skill descriptions
├── .agents/
│   └── skills/
│       ├── general → ../../skills/general     # symlink
│       └── im-adapter → ../../skills/im-adapter
└── skills/
    ├── general/
    └── im-adapter/
```

### Output Parsing

Codex emits NDJSON (`--json`). The parser handles:

| Event | Action |
|-------|--------|
| `thread.started` | Captures `thread_id` for session resume (not forwarded to consumer) |
| `item.completed` (`agent_message`) | Emits `text` event |
| `item.completed` (`command_execution`) | Emits `tool_call` + `tool_result` events |
| `turn.completed` | Emits `done` event with `sessionId = thread_id` |
| `turn.failed` | Emits `error` event |
| Top-level `error` | WebSocket reconnection notices are suppressed; other errors emit a `warning` event |

### Session Resume

The `thread_id` from `thread.started` is saved as `sessionId`. On the next turn GolemBot calls:

```bash
codex exec resume --json --dangerously-bypass-approvals-and-sandbox --skip-git-repo-check <thread_id> "<prompt>"
```

The `resume` subcommand inherits all flags and continues the existing session context.

## Notes

- Codex Cloud (Codex Cloud tasks) is only available with ChatGPT OAuth, not with an API key
- Unlike other engines, Codex does not provide cost/token tracking in the `done` event
- Skills are injected via `.agents/skills/` symlinks (native Codex discovery) and `AGENTS.md` at the workspace root
