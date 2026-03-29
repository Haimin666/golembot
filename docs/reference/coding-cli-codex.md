# Codex CLI

### Official Documentation

- **Docs Root:** https://developers.openai.com/codex
- **GitHub:** https://github.com/openai/codex
- **Non-interactive (exec) guide:** https://developers.openai.com/codex/noninteractive/
- **CLI reference:** https://developers.openai.com/codex/cli/reference/
- **AGENTS.md guide:** https://developers.openai.com/codex/guides/agents-md/
- **Authentication:** https://developers.openai.com/codex/auth/
- **Security / Sandboxing:** https://developers.openai.com/codex/security
- **Models:** https://developers.openai.com/codex/models/
- **SDK:** https://developers.openai.com/codex/sdk/
- **App Server protocol:** https://developers.openai.com/codex/app-server/
- **Changelog:** https://developers.openai.com/codex/changelog/

OpenAI Codex CLI is an open-source (Rust, 96%) terminal-based coding agent. It can read, edit, and run code on your machine within a selected directory. Released April 2025. Available on macOS and Linux; Windows experimental (via WSL).

---

### Installation

```bash
# npm (global)
npm install -g @openai/codex

# Homebrew (macOS)
brew install codex

# GitHub Releases platform binaries
# macOS Apple Silicon: codex-aarch64-apple-darwin.tar.gz
# macOS x86_64:        codex-x86_64-apple-darwin.tar.gz
# Linux x86_64 (musl): codex-x86_64-unknown-linux-musl.tar.gz
# Linux arm64 (musl):  codex-aarch64-unknown-linux-musl.tar.gz
```

Binary name: `codex`. npm package: `@openai/codex`.

---

### Actual Invocation Method (Verified for GolemBot)

Non-interactive headless invocation for GolemBot integration:

```bash
# New session
codex exec --json --full-auto --skip-git-repo-check "prompt here"

# Resume session
codex exec resume --json --full-auto --skip-git-repo-check <SESSION_ID> "continue the refactor"
```

Key flags:

| Flag | Purpose |
|------|---------|
| `--json` | Emit JSONL event stream to stdout (machine-readable) |
| `--full-auto` | Shortcut: `--sandbox workspace-write --ask-for-approval on-request` |
| `--skip-git-repo-check` | Allow running outside a Git repository (temp dirs, CI workspaces) |
| `--dangerously-bypass-approvals-and-sandbox` / `--yolo` | Disable ALL safety checks — use only inside isolated containers |
| `--model <id>` | Override model (API key mode only) |
| `--cd <path>` | Set working directory before processing |
| `--ephemeral` | Skip session persistence |

**Flag placement:** Global flags must appear **after** the subcommand:
```bash
codex exec --json --full-auto "prompt"   # ✅ correct
codex --json exec "prompt"               # ❌ wrong
```

**Resume subcommand flag placement:** When resuming, all flags come after `resume`:
```bash
codex exec resume --json --full-auto --skip-git-repo-check <id> "prompt"   # ✅ correct
codex exec --json --full-auto resume <id> "prompt"                          # ❌ wrong
```

**stdout vs stderr split (critical for integration):**
- `stdout` — pure JSONL events (only when `--json` is set)
- `stderr` — config summary, progress indicators, warnings

Spawn with `stdio: ['pipe', 'pipe', 'pipe']` and consume stdout/stderr independently.

---

### stream-json Output Format

`codex exec --json` emits one complete JSON object per line to stdout (NDJSON). Events are **not** SSE, just newline-delimited JSON.

#### Event Type Overview

| Type | Description |
|------|-------------|
| `thread.started` | Session initialized; contains `thread_id` |
| `turn.started` | New conversation turn begun |
| `turn.completed` | Turn finished; contains `usage` (input/output tokens) |
| `turn.failed` | Turn encountered an error |
| `item.started` | A work item has started |
| `item.updated` | Work item streaming delta |
| `item.completed` | Work item finished; contains final content |
| `error` | Top-level error event |

#### `item.type` Values (inside `item.started` / `item.completed`)

| Item type | Description |
|-----------|-------------|
| `agent_message` | User-facing text response — read `item.text` |
| `reasoning` | Internal model reasoning |
| `command_execution` | Shell command executed by the agent |
| `file_change` | File modified by the agent |
| `mcp_tool_call` | MCP server tool invocation |
| `web_search` | Live web search (requires `--search` flag) |
| `todo_list` | Plan/task list update |
| `error` | Error within an item |

#### Example Events (exact field names)

```json
{"type":"thread.started","thread_id":"0199a213-81c0-7800-8aa1-bbab2a035a53"}
{"type":"turn.started"}
{"type":"item.started","item":{"id":"item_1","type":"command_execution","command":"bash -lc ls","status":"in_progress"}}
{"type":"item.completed","item":{"id":"item_3","type":"agent_message","text":"Here is the analysis..."}}
{"type":"turn.completed","usage":{"input_tokens":24763,"cached_input_tokens":24448,"output_tokens":122}}
```

#### GolemBot Parsing Strategy

```
thread.started  → extract thread_id → save as sessionId (do not yield)
item.completed + item.type === "agent_message" → yield { type: 'text', content: item.text }
  (fallback: item.content[].output_text concatenated, for OpenAI API-style format)
item.completed + item.type === "command_execution" → yield { type: 'tool_call', name: item.command, args: '' }
  + (if item.output exists) yield { type: 'tool_result', content: item.output }
turn.completed  → yield { type: 'done', sessionId }
  Note: Codex does not provide per-request cost; costUsd is not emitted.
turn.failed / error → yield { type: 'error', message: ... }
top-level error (Reconnecting... X/Y) → suppressed (WebSocket reconnection noise, not a real error)
```

**Known limitation (GitHub issue #5028, PR #4525):** `mcp_tool_call` items do **not** include tool arguments or results in the `--json` output — only the server/tool name. This was a deliberate change that broke some integrations. Full tool traces are only available via the App Server protocol.

---

### Session Resume

Sessions stored under `~/.codex/sessions/` (or `$CODEX_HOME/sessions/`).

```bash
# Resume specific session (non-interactive)
codex exec resume --json --full-auto --skip-git-repo-check <SESSION_ID> "continue the refactor"

# Resume most recent session (non-interactive)
codex exec resume --last "next step"

# Also consider all directories (not just cwd)
codex exec resume --last --all "next step"
```

**Capturing the session ID:** The `thread_id` from `thread.started` event is the only programmatic way to obtain the session ID. There is no separate env var or flag for it (open feature request: issue #8923).

---

### Authentication Methods

Two auth paths:

| Method | Use case | Billing |
|--------|---------|---------|
| ChatGPT OAuth (browser) | Interactive use, ChatGPT subscribers | ChatGPT subscription |
| API key | CI/CD, headless, programmatic | OpenAI API pay-per-token |

Note: Codex Cloud tasks are only available with ChatGPT auth, not API key.

**Environment variables:**

| Variable | Purpose |
|----------|---------|
| `CODEX_API_KEY` | Primary env var for API-auth mode (official CI docs) |
| `OPENAI_API_KEY` | Also accepted; set both for maximum compatibility |
| `OPENAI_BASE_URL` | Override API endpoint (proxy / Azure) |
| `CODEX_HOME` | Override default `~/.codex` state directory |

**Headless / CI authentication:**
```bash
# Pre-login with API key (stored in ~/.codex/auth.json)
printenv OPENAI_API_KEY | codex login --with-api-key

# Inline for single run
CODEX_API_KEY="sk-..." codex exec --json "run tests"

# Device code flow for remote machines
codex login --device-code
```

**ChatGPT OAuth (browser login)** — for ChatGPT Plus/Pro/Team/Enterprise subscribers:
```bash
codex login    # opens browser; credentials stored in ~/.codex/auth.json
```
GolemBot automatically uses stored OAuth credentials — no extra configuration needed.

> **Model compatibility:** `codex-mini-latest` is only available in API key mode. When using ChatGPT OAuth, leave `model` unset so Codex selects the appropriate model for your subscription automatically.

**Known quirk (issues #2638, #3286):** If both ChatGPT session and `OPENAI_API_KEY` are present, behavior may be inconsistent across versions. For CI/CD, explicitly log in with API key to avoid ambiguity.

---

### Skill Discovery

Codex supports two skill discovery mechanisms:

#### 1. `.agents/skills/` (Native Skill Directories)

Each skill is a directory containing a `SKILL.md` with optional frontmatter (`name`, `description`):

- **Global:** `~/.agents/skills/`
- **Project:** `.agents/skills/`

Codex auto-discovers skill directories and uses progressive disclosure (skill descriptions loaded first, full content on-demand).

**GolemBot injects skills** by symlinking each `skills/<name>` directory to `.agents/skills/<name>`.

#### 2. `AGENTS.md` (Project Instructions)

Codex reads `AGENTS.md` files before doing any work. Discovery order:

1. **Global** (`~/.codex/`): `AGENTS.override.md` → `AGENTS.md`
2. **Project** (Git root down to cwd): walks each level, reads `AGENTS.override.md` → `AGENTS.md` → configured fallback filenames
3. **Merge**: files concatenate root → innermost; inner overrides outer

Configuration in `~/.codex/config.toml`:
```toml
project_doc_fallback_filenames = ["TEAM_GUIDE.md", ".agents.md"]
project_doc_max_bytes = 65536    # default 32 KiB per file
```

**GolemBot** also generates `AGENTS.md` at the workspace root with skill descriptions and project instructions.

**Protected directories (always read-only, even in workspace-write mode):**
- `.git/`
- `.agents/`
- `.codex/`

---

### Permissions System

#### Sandbox Modes (physical capability)

| Mode | Description |
|------|-------------|
| `read-only` | Default for `codex exec`. Browse files, no writes, no network |
| `workspace-write` | Read + write within working directory. No network by default |
| `danger-full-access` | Unrestricted, including network. Use only in isolated containers |

#### Approval Policy (when to pause)

| Policy | Behavior |
|--------|---------|
| `untrusted` | Only known-safe read-only commands auto-run; all others prompt |
| `on-request` | Model decides when to ask for approval |
| `never` | Never prompts — used with `danger-full-access` for full automation |

**`--full-auto`** = `--sandbox workspace-write` + `--ask-for-approval on-request`
**`--yolo`** = disables all sandboxing and approvals (use inside Docker/isolated env only)

**Default for `codex exec` (headless):** Approval policy defaults to `never`, which **auto-cancels** all elicitation requests (MCP approval prompts, sandbox escalation). With `--full-auto`, policy shifts to `on-request`, which auto-approves commands instead of canceling.

#### Sandbox Implementation by OS

| OS | Mechanism |
|----|----------|
| macOS | `sandbox-exec` (Seatbelt policies) |
| Linux | Landlock + seccomp; optional `bwrap` for network proxy |
| Windows (WSL) | Linux mechanism inside WSL |

---

### Model Configuration

Models as of early 2026 (subject to change; check https://developers.openai.com/codex/models/):

| Model ID | Description |
|----------|-------------|
| `5.3-codex` | Latest full-size model; visible to API users since Feb 2026 |
| `codex-1` | Original o3-based release model, tuned for software engineering |
| `codex-mini-latest` | o4-mini-based, low-latency, cost-effective (API key mode only) |

Switching model:
```bash
codex exec --model codex-mini-latest --json "your task"
```

Or in `~/.codex/config.toml`:
```toml
model = "codex-mini-latest"
```

---

### Known Pitfalls & GolemBot Adaptation Notes

1. **`--json` flag placement**: Must come after `exec` subcommand — `codex exec --json`, not `codex --json exec`.

2. **`resume` is a subcommand, not a flag**: `codex exec resume <id> "prompt"` — but not all flags belong to the `exec` subcommand. Top-level flags like `--ask-for-approval` and `--search` must be placed before `exec`, while `--json`, `--sandbox`, `--add-dir`, and `--image` stay on `exec`.

3. **`--skip-git-repo-check` required**: Without this flag, Codex refuses to run outside a Git repository. GolemBot uses temp dirs, so this flag is mandatory.

4. **Tool call args missing (#5028)**: `mcp_tool_call` items in `--json` output don't include arguments or results. Only tool name is available. Use App Server protocol for full traces.

5. **Session ID only in JSONL stream**: `thread_id` from `thread.started` event is the only way to capture session ID programmatically. No env var for it (issue #8923).

6. **Auth conflict with dual credentials**: Both ChatGPT session + `OPENAI_API_KEY` can cause unpredictable auth behavior. For CI, use `codex login --with-api-key` explicitly.

7. **`codex exec` default auto-cancels approvals**: Without an explicit execution mode, the agent auto-cancels permission escalation requests in headless mode. GolemBot now exposes this as `codex.mode`: default `unrestricted` maps to `--dangerously-bypass-approvals-and-sandbox`, while `safe` maps to `--full-auto`.

8. **WebSocket reconnection noise (OAuth mode)**: Codex Cloud (used with ChatGPT OAuth) always retries the WebSocket connection 4 times before falling back to HTTPS. This emits `{"type":"error","message":"Reconnecting... X/5 ..."}` events during retries. GolemBot suppresses these automatically — they are not real errors.

9. **`codex-mini-latest` model incompatible with OAuth**: `codex-mini-latest` is only available in API key mode. Do not set `model: codex-mini-latest` when using ChatGPT OAuth — let Codex auto-select the model.

10. **No `--session-key` concept**: Sessions are identified by internal UUIDs stored in `~/.codex/sessions/`. GolemBot must capture `thread_id` from `thread.started` and persist it as sessionId.

11. **TTY echo bug (#3646)**: Interactive `sudo` prompts inside agent-executed commands can hang the terminal. Avoid sudo in prompts.

12. **Input size cap**: Shared ~1M-character input cap as of v0.106.0 to prevent hangs on oversized inputs.

13. **`--image` changes prompt ordering**: when attaching images, keep the prompt before `--image <path>...` in the `exec` argument list. Putting image flags first can make Codex think it should read the prompt from stdin.

14. **Rapid release pace**: Codex CLI iterates fast; verify flag syntax against the installed version's `codex exec --help` output before relying on it in CI.
