# Golem Project Context

## Overview

Golem is a local-first personal AI assistant library that uses Coding Agent CLIs (Cursor / Claude Code / OpenCode) as core engines. Core philosophy: Coding Agent = the soul, Golem = the body of clay.

npm package name: `golem-ai`

## Architecture Docs

**[docs/architecture.md](docs/architecture.md) is the authoritative architecture reference. All implementations must stay consistent with it.**

Update the architecture doc before modifying code whenever:

- An implementation conflicts with the architecture
- New concepts, interfaces, or modules are introduced
- Existing interface signatures or behaviors change
- Optimizations or simplifications are identified
- Phase evolution brings architectural changes

## Core Design Principles

1. **Library first, CLI is a thin shell** — The core is the `createAssistant()` API; the CLI is just a consumer
2. **Directory = assistant** — A directory is an assistant (a Golem); the directory is the single source of truth
3. **Directory = skill list** — Whatever is in `skills/` gets loaded; no separate declaration in config
4. **Only two concepts** — Assistant directory + Skill. Nothing else
5. **Don't do what the Agent should do** — No context management, no tool dispatching, no decision-making; all delegated to the Coding Agent
6. **Skill injection is the engine's job** — Each engine decides how to inject skills

## Project Structure

```
golem-ai/
├── docs/
│   ├── architecture.md       # Core architecture document (must-read)
│   ├── coding_cli_docs.md    # Coding Agent CLI behavior docs (Cursor + Claude Code + OpenCode)
│   └── todo/                 # Task tracking (bugs, tech debt, feature plans)
├── src/
│   ├── index.ts              # Core API (createAssistant, KeyedMutex)
│   ├── engine.ts             # Engine interface + CursorEngine + ClaudeCodeEngine + OpenCodeEngine
│   ├── workspace.ts          # Config loading + skills scanning + AGENTS.md generation
│   ├── session.ts            # Multi-user session store (indexed by sessionKey)
│   ├── server.ts             # HTTP service (SSE + Bearer auth)
│   ├── channel.ts            # IM channel adapter interface + utilities
│   ├── channels/             # Channel adapter implementations (feishu, dingtalk, wecom)
│   ├── gateway.ts            # Gateway service (IM channels + HTTP API)
│   ├── onboard.ts            # Interactive setup wizard
│   ├── cli.ts                # CLI thin shell (init / run / serve / gateway / onboard / status / skill)
│   └── __tests__/            # Unit tests (vitest)
├── examples/
│   ├── e2e-test.ts           # End-to-end test (requires real Cursor Agent CLI)
│   ├── e2e-headless.ts       # Headless e2e (requires CURSOR_API_KEY)
│   ├── e2e-claude-code.ts    # Claude Code engine e2e (requires ANTHROPIC_API_KEY or claude auth)
│   └── e2e-opencode.ts       # OpenCode engine e2e (requires OPENROUTER_API_KEY or other Provider Key)
├── skills/                   # Built-in skills (shipped with npm package)
│   ├── general/
│   │   └── SKILL.md
│   └── im-adapter/
│       └── SKILL.md
├── templates/                # Scenario templates (6 built-in)
├── .env                      # Sensitive config (API keys, gitignored)
├── .env.example              # .env template (no secrets)
├── Dockerfile
├── docker-compose.yml
├── package.json
├── tsconfig.json
├── AGENTS.md                 # This file
└── README.md
```

## Current Phase

Phase 5 completed — IM integration, Gateway, onboard wizard, templates, Docker deployment.

Completed:
- Phase 1: CLI assistant (init / run), Cursor Engine, session resume + auto-fallback
- Phase 2: sessionKey multi-user routing, KeyedMutex per-user concurrency isolation, HTTP service (SSE + Bearer auth), `golem-ai serve` command
- Phase 3: Claude Code Engine (stream-json parsing, .claude/skills/ native injection, CLI integration)
- Phase 3: OpenCode Engine (NDJSON parsing, .opencode/skills/ injection, multi-Provider API Key, opencode.json permission config)
- Phase 4: Built-in skills (general + im-adapter), assistant templates (6 scenarios)
- Phase 5: IM channel adapters (Feishu, DingTalk, WeCom), Gateway service, onboard wizard, Docker deployment

Next: Skill ecosystem, more IM channels, plugin marketplace.

See [docs/architecture.md](docs/architecture.md) for the full evolution roadmap.

## Development Commands

```bash
pnpm install          # Install dependencies (use pnpm, not npm)
pnpm run build        # TypeScript compile → dist/
pnpm run test         # Run unit tests (vitest, mock engine)
pnpm run test:watch   # Unit tests in watch mode
pnpm run e2e          # End-to-end test (requires Cursor Agent CLI)
pnpm run e2e:headless    # Headless e2e (auto-loads CURSOR_API_KEY from .env)
pnpm run e2e:claude-code # Claude Code engine e2e (requires ANTHROPIC_API_KEY or claude auth)
pnpm run e2e:opencode    # OpenCode engine e2e (requires OPENROUTER_API_KEY or other Provider Key)
pnpm run dev          # Run CLI directly with tsx (development)
```

## Key Technical Details

### Cursor Agent CLI
- Binary at `~/.local/bin/agent`
- Must be invoked via PTY (node-pty); cannot use regular subprocess (Cursor checks TTY)
- Output format: `--output-format stream-json --stream-partial-output` (streaming text deltas)
- Key flags: `--force --trust --sandbox disabled --approve-mcps`
- Session resume: `--resume <sessionId>`; Golem auto-clears and retries on failure
- Skill injection: symlink to `.cursor/skills/` directory
- Auth: local via `agent login`, CI/CD via `CURSOR_API_KEY` env var or `--api-key` flag
- apiKey passthrough: `CreateAssistantOpts.apiKey → InvokeOpts.apiKey → CursorEngine (--api-key + env)`
- See [docs/coding_cli_docs.md](docs/coding_cli_docs.md)

### Claude Code CLI
- Binary at `~/.local/bin/claude`
- Uses standard `child_process.spawn` (no PTY needed)
- Output format: `--output-format stream-json --verbose` (`--verbose` required, otherwise only outputs result)
- Headless mode: `--dangerously-skip-permissions`
- Session resume: `--resume <sessionId>`
- Skill injection: symlink to `.claude/skills/` directory (native discovery) + generate `CLAUDE.md`
- Auth: `claude auth login` or `ANTHROPIC_API_KEY` env var
- apiKey passthrough: `CreateAssistantOpts.apiKey → InvokeOpts.apiKey → ClaudeCodeEngine (env ANTHROPIC_API_KEY)`
- **Key difference**: A single `assistant` message can contain mixed text + tool_use content blocks; `parseClaudeStreamLine()` returns `StreamEvent[]`
- StreamEvent `done` event includes `costUsd` and `numTurns` fields (Claude Code only)
- See [docs/coding_cli_docs.md](docs/coding_cli_docs.md)

### OpenCode CLI
- Install: `npm install -g opencode-ai`
- Uses standard `child_process.spawn` (no PTY needed)
- Output format: `--format json` (NDJSON, event structure entirely different from Cursor/Claude Code)
- Headless mode: via `opencode.json` setting `"permission": {"*": "allow"}` (no CLI flag needed)
- Session resume: `--session <ses_xxx>` (note: not `--resume`, and ID format is `ses_XXXXXXXX`)
- Skill injection: symlink to `.opencode/skills/` (also compatible with `.claude/skills/` and `.agents/skills/`)
- Auth: multi-Provider support; API key env var depends on selected Provider (e.g. `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`)
- `resolveOpenCodeEnv()` infers Provider from model string (`provider/model`) and sets corresponding env var
- `ensureOpenCodeConfig()` generates `opencode.json` to ensure permissions and model config are correct
- **Key difference**: Event structure based on parts array (`text`, `tool-invocation`, `step-finish`, etc.); `parseOpenCodeStreamLine()` returns `StreamEvent[]`
- Known issue: v1.1.28 `question` tool has a bug in non-interactive mode; work around by allowing all permissions
- See [docs/coding_cli_docs.md](docs/coding_cli_docs.md)

### Sensitive Config Management
- `.env` stores `CURSOR_API_KEY`, `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY` and other secrets (gitignored)
- `.env.example` provides a template without actual values
- e2e scripts auto-load `.env` on startup (does not overwrite existing env vars)

### stream-json Event Types (Cursor)
- `type: "system", subtype: "init"` — Init info with session_id; does not signal end of conversation
- `type: "assistant"` — Assistant reply delta; text in `message.content[].text`
- `type: "tool_call", subtype: "started"` — Tool call started → yields `tool_call`
- `type: "tool_call", subtype: "completed"` — Tool call completed → yields `tool_result`
- `type: "result"` — Conversation end; `is_error: true` indicates failure; includes `duration_ms`

### stream-json Event Types (Claude Code)
- `type: "system"` → ignored (empty array)
- `type: "assistant"` → iterate `message.content[]`: `text` → `StreamEvent.text`, `tool_use` → `StreamEvent.tool_call` (single message can contain multiple block types)
- `type: "user"` → iterate `message.content[]`: `tool_result` → `StreamEvent.tool_result`
- `type: "result"` → `done` (with `session_id`, `duration_ms`, `total_cost_usd`, `num_turns`) or `error`

### NDJSON Event Types (OpenCode)
- `type: "error"` → `StreamEvent.error` (extracted from `error.data.message` or `error.name`)
- parts array `type: "text"` → `StreamEvent.text`
- parts array `type: "tool-invocation"` (no result) → `StreamEvent.tool_call`
- parts array `type: "tool-invocation"` (has result) → `StreamEvent.tool_result`
- parts array `type: "step-finish"` → `StreamEvent.done` (with `cost`, `sessionID`)
- parts array `type: "reasoning"` / `type: "step-start"` → ignored
- `type: "session.complete"` → `StreamEvent.done`

### Testing Strategy
- **Unit tests**: Mock engine replaces real Cursor; validates core logic (session routing, concurrency locks, HTTP endpoints, apiKey passthrough, durationMs propagation, etc.)
- **End-to-end tests** (`pnpm run e2e`): Calls real Cursor Agent; validates skill auto-discovery, file I/O, multi-instance isolation, HTTP service, durationMs, etc.
- **Headless e2e** (`pnpm run e2e:headless`): Validates CURSOR_API_KEY auth, HTTP production deployment, ops scenarios, multi-tenant, service restart persistence
- **Claude Code e2e** (`pnpm run e2e:claude-code`): Validates Claude Code engine basic conversation, multi-turn context, session isolation, HTTP service, costUsd/numTurns metadata
- **OpenCode e2e** (`pnpm run e2e:opencode`): Validates OpenCode engine basic conversation, multi-turn context, skill injection (.opencode/skills/ + opencode.json), file I/O, script execution, IM bot, CI/CD, HTTP service
- e2e tests use pure natural language prompts; no skill names or script paths specified in prompts
- **New features must have dedicated verification tests** — passing existing tests alone is not sufficient. See `.cursor/rules/testing-conventions.mdc`
