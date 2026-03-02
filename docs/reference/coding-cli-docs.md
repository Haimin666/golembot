# Coding Agent CLI Documentation and Field Notes

## Cursor Agent CLI

### Official Documentation

- Overview: https://cursor.com/docs/cli/overview
- Installation: https://cursor.com/docs/cli/installation
- Using Agent: https://cursor.com/docs/cli/using
- Shell Mode: https://cursor.com/docs/cli/shell-mode
- MCP: https://cursor.com/docs/cli/mcp
- Headless CLI: https://cursor.com/docs/cli/headless
- GitHub Actions: https://cursor.com/docs/cli/github-actions
- Slash Commands: https://cursor.com/docs/cli/reference/slash-commands
- Parameters: https://cursor.com/docs/cli/reference/parameters
- Authentication: https://cursor.com/docs/cli/reference/authentication
- Permissions: https://cursor.com/docs/cli/reference/permissions
- Configuration: https://cursor.com/docs/cli/reference/configuration
- Output Format: https://cursor.com/docs/cli/reference/output-format
- Terminal Setup: https://cursor.com/docs/cli/reference/terminal-setup

---

### Installation

**Prerequisites**: None — the Cursor CLI (`agent`) is a standalone binary that does **not** require the Cursor IDE to be installed.

**Install via curl** (recommended):

```bash
curl https://cursor.com/install -fsS | bash
```

This installs the `agent` binary to `~/.local/bin/agent` (Linux/macOS) or `~/.cursor/bin/agent` (some CI environments). Ensure the install directory is on your `PATH`:

```bash
echo "$HOME/.local/bin" >> ~/.bashrc   # or ~/.zshrc
# In GitHub Actions:
echo "$HOME/.cursor/bin" >> $GITHUB_PATH
```

**Verify installation:**

```bash
agent --version
```

---

### Actual Invocation Method (Verified in GolemBot)

**Binary name**: `agent` (not `cursor`)
**Binary path**: `~/.local/bin/agent`

```bash
agent \
  -p "user message" \
  --output-format stream-json \
  --stream-partial-output \
  --workspace /path/to/assistant-dir \
  --force --trust --sandbox disabled \
  --approve-mcps \
  [--resume <sessionId>] \
  [--model <model-name>]
```

**PTY is not needed** (as of CLI version 2026.02+). Verified that `child_process.spawn` produces clean NDJSON on stdout with zero ANSI escape sequences. GolemBot has migrated `CursorEngine` from `node-pty` to standard `child_process.spawn`, eliminating the only native C++ dependency. `stripAnsi()` is retained as a safety net but is not expected to be triggered.

---

### stream-json Output Format

One JSON object per line (NDJSON). With `child_process.spawn` (verified in CLI version 2026.02+), stdout produces clean JSON with no ANSI escape sequences. `stripAnsi()` is retained as a safety net.

#### Event Type Overview

| type | subtype | Meaning | Key Fields |
|------|---------|---------|------------|
| `system` | `init` | Initialization | `session_id`, `model`, `cwd`, `apiKeySource` |
| `user` | — | User input (echo) | `message.content[].text` |
| `assistant` | — | Assistant reply | `message.content[].text` — array, filter for `type=text` and concatenate |
| `tool_call` | `started` | Tool call started | `call_id`, `tool_call.<XxxToolCall>.args` |
| `tool_call` | `completed` | Tool call completed | `call_id`, `tool_call.<XxxToolCall>.result` |
| `result` | `success` | Conversation ended normally | `session_id`, `duration_ms`, `result` (full text concatenation) |
| `result` | `error` | Conversation ended with error | `is_error: true`, `result` (error message) |

#### `--stream-partial-output` Behavior

Without this parameter, `assistant` events contain the **complete text** between two tool calls (output all at once).
With this parameter, `assistant` events become **character-level incremental deltas** — multiple `assistant` events must be concatenated to form the complete text.

**Key gotcha**: After all deltas for each segment (text between tool calls), Cursor sends an additional **summary event** whose content = concatenation of all deltas in that segment. If the summary is not skipped, **the user sees every segment repeated twice**. GolemBot detects and skips summaries at the CursorEngine layer through accumulated text comparison.

**GolemBot has this parameter enabled**, achieving true character-by-character streaming.

#### tool_call Structure

**Standard structure (vast majority of tools):**

```json
{
  "type": "tool_call",
  "subtype": "started",
  "call_id": "toolu_vrtx_01NnjaR886UcE8whekg2MGJd",
  "tool_call": {
    "readToolCall": {
      "args": { "path": "sales.csv" }
    }
  }
}
```

**Completed event includes result:**

```json
{
  "type": "tool_call",
  "subtype": "completed",
  "call_id": "toolu_vrtx_01NnjaR886UcE8whekg2MGJd",
  "tool_call": {
    "readToolCall": {
      "args": { "path": "sales.csv" },
      "result": {
        "success": {
          "content": "product,date,quantity...",
          "totalLines": 54,
          "totalChars": 1254
        }
      }
    }
  }
}
```

**Known tool names (the key is not a fixed enum — must be dynamically matched with `*ToolCall`):**
- `readToolCall` — Read file
- `writeToolCall` — Write file
- `ShellToolCall` — Execute command

**Alternative structure (some tools use the `function` format):**

```json
{
  "type": "tool_call",
  "subtype": "started",
  "tool_call": {
    "function": {
      "name": "tool_name",
      "arguments": "{\"query\": \"test\"}"
    }
  }
}
```

**GolemBot's parsing strategy:**
- `subtype: "started"` or no subtype → yield `{ type: 'tool_call', name, args }`
- `subtype: "completed"` → yield `{ type: 'tool_result', content }` (extract result field)
- Handles both `*ToolCall` and `function` structures

---

### Session Resume

- `--resume <sessionId>` parameter lets the Agent continue a conversation in the same context
- `--continue` is an alias for `--resume=-1`, resuming the most recent session
- `agent ls` lists all historical sessions
- session_id is obtained from the `session_id` field of `type: "result"` events
- Resume failure manifests as: Agent process exits with a non-zero exit code, or the result event returns `is_error: true`
- Failure messages typically contain "resume" or "session" keywords

**GolemBot's fallback strategy**: On detecting resume failure → clear the saved session → retry once without `--resume`

---

### Authentication Methods

| Method | Use Case | Setup |
|--------|----------|-------|
| `agent login` | Local development (recommended) | Browser OAuth flow, credentials stored locally |
| `CURSOR_API_KEY` environment variable | CI/CD, scripts, headless environments | Obtain from Cursor Dashboard → Integrations → User API Keys |
| `--api-key <key>` parameter | One-off invocations | Pass directly |

**CI/CD scenarios must use API key** — `agent login` requires browser interaction.

---

### Skill Auto-Discovery Mechanism

When Cursor Agent starts, it reads:
1. All `SKILL.md` files under the `.cursor/skills/` directory
2. `AGENTS.md` and `CLAUDE.md` at the project root (if they exist)
3. Rule files under the `.cursor/rules/` directory

The Agent **autonomously decides** when to use which Skill — no need for the user to specify in the prompt.

GolemBot's approach is to symlink `skills/<name>` to `.cursor/skills/<name>`, refreshing symlinks before each invoke.

---

### Permissions System

Fine-grained permissions can be configured via `~/.cursor/cli-config.json` (global) or `.cursor/cli.json` (project-level):

| Format | Example | Effect |
|--------|---------|--------|
| `Shell(cmd)` | `Shell(git)`, `Shell(npm)` | Controls which commands can be executed |
| `Read(glob)` | `Read(src/**/*.ts)` | Controls which files can be read |
| `Write(glob)` | `Write(docs/**/**)` | Controls which files can be written |
| `WebFetch(domain)` | `WebFetch(*.github.com)` | Controls which domains can be accessed |
| `Mcp(server:tool)` | `Mcp(datadog:*)` | Controls which MCP tools can be used |

Deny rules take precedence over allow rules. Valuable for security-sensitive scenarios (e.g., CI/CD code review bots).

---

### MCP Support

The Agent automatically detects and uses MCP servers configured in `.cursor/mcp.json`.
- `--approve-mcps` parameter skips the MCP approval prompt (required for headless — **GolemBot has this enabled**)
- `agent mcp list` shows configured MCP servers
- `agent mcp list-tools <server>` shows tools provided by a specific MCP server

---

### Cloud Agent

- `-c` / `--cloud` starts a cloud Agent, pushing the conversation to the cloud for continuous execution
- In interactive sessions, prefixing a message with `&` sends the task to a Cloud Agent
- Suitable for long-running tasks — the user doesn't need to wait
- View and continue cloud tasks at cursor.com/agents

---

### Configuration Files

| File | Location | Content |
|------|----------|---------|
| `cli-config.json` | `~/.cursor/cli-config.json` | Global config (permissions, vim mode, network proxy, etc.) |
| `cli.json` | `.cursor/cli.json` (project-level) | Permissions config only |

---

### GitHub Actions Integration

**Cursor:**

```yaml
- name: Install Cursor CLI
  run: |
    curl https://cursor.com/install -fsS | bash
    echo "$HOME/.cursor/bin" >> $GITHUB_PATH

- name: Run Cursor Agent
  env:
    CURSOR_API_KEY: ${{ secrets.CURSOR_API_KEY }}
  run: |
    agent -p "Your prompt here" --model gpt-5.2
```

**Claude Code:**

```yaml
- name: Install Claude Code
  run: npm install -g @anthropic-ai/claude-code

- name: Run Claude Code
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
  run: |
    claude -p "Your prompt here" --output-format stream-json --verbose
```

Two autonomy levels supported:
- **Full autonomy** — Agent has full permissions including git push, PR commenting, etc.
- **Restricted autonomy (recommended)** — Agent only modifies files; git/gh operations are controlled by CI scripts

---

### Known Pitfalls

1. **stdout buffer doesn't split by line** — `data` events may fire at arbitrary byte boundaries; you must manually maintain a buffer and split on `\n`
2. **Buffer may have residual data when process exits** — You must drain remaining content in the `close` callback
3. **ANSI stripping retained as safety net** — With `child_process.spawn` (2026.02+), stdout is clean JSON. `stripAnsi()` is kept for backward compatibility with older CLI versions that may have been invoked via PTY
4. **`--sandbox disabled` is required** — Otherwise the Agent fails on certain operations (like writing files) due to permission issues
5. **`--force --trust` are required** — Skip interactive confirmations; otherwise the Agent waits for user input and hangs
6. **`--approve-mcps` should always be included** — Otherwise, when MCP config exists, it interactively asks whether to approve, causing headless hangs
7. **`--stream-partial-output` causes summary duplication** — After each segment's deltas, an additional summary event is sent (content = all deltas concatenated). The consumer must deduplicate, or text will be doubled. GolemBot detects summaries via accumulated comparison and skips them
8. **tool_call has both started/completed events** — If not differentiated, each tool call gets processed twice
9. **tool_call key names are not fixed** — You can't hardcode `readToolCall`; you must dynamically match the `*ToolCall` suffix, and some tools use the `function` structure
10. **The `result` event's `result` field is a full-text concatenation** — Not just the last segment, but a concatenation of all assistant text

## Claude Code CLI

### Official Documentation

**Core docs:**

- Overview: https://code.claude.com/docs/en/overview
- CLI Reference (complete command + parameter list): https://code.claude.com/docs/en/cli-reference
- How Claude Code Works (architecture + tools): https://code.claude.com/docs/en/how-claude-code-works
- Run Programmatically / Headless: https://code.claude.com/docs/en/headless
- Memory & CLAUDE.md: https://code.claude.com/docs/en/memory
- Skills: https://code.claude.com/docs/en/skills
- Authentication: https://code.claude.com/docs/en/authentication
- Permissions: https://code.claude.com/docs/en/permissions
- Settings: https://code.claude.com/docs/en/settings
- Model Configuration: https://code.claude.com/docs/en/model-config

**Extended capabilities:**

- MCP (Model Context Protocol): https://code.claude.com/docs/en/mcp
- Subagents: https://code.claude.com/docs/en/sub-agents
- Hooks: https://code.claude.com/docs/en/hooks-guide
- Plugins: https://code.claude.com/docs/en/plugins

**Deployment & CI/CD:**

- GitHub Actions: https://code.claude.com/docs/en/github-actions
- GitLab CI/CD: https://code.claude.com/docs/en/gitlab-ci-cd
- Costs: https://code.claude.com/docs/en/costs

**Agent SDK (TypeScript / Python):**

- SDK Overview: https://platform.claude.com/docs/en/agent-sdk/overview
- Streaming Output: https://platform.claude.com/docs/en/agent-sdk/streaming-output
- Sessions: https://platform.claude.com/docs/en/agent-sdk/sessions

**stream-json event format cheatsheet:**

- Third-party summary: https://takopi.dev/reference/runners/claude/stream-json-cheatsheet/

**Full documentation index (LLM-friendly):**

- https://code.claude.com/docs/llms.txt

---

### Installation

**Prerequisites**: Node.js >= 18

```bash
npm install -g @anthropic-ai/claude-code
```

**Verify installation:**

```bash
claude --version
```

---

### Actual Invocation Method (Verified in GolemBot)

**Binary path**: `~/.local/bin/claude` (same directory as Cursor Agent's `agent`)

```bash
~/.local/bin/claude \
  -p "user message" \
  --output-format stream-json \
  --verbose \
  --dangerously-skip-permissions \
  [--resume <sessionId>] \
  [--model <model-alias>]
```

**PTY is not needed**. Claude Code CLI supports standard stdin/stdout — a regular `child_process.spawn()` suffices. All three engines (Cursor, Claude Code, OpenCode) now use the same `child_process.spawn` approach.

---

### stream-json Output Format

One JSON object per line (NDJSON); stdout outputs pure JSON without ANSI escape sequences.

#### Event Type Overview

| type | subtype | Meaning | Key Fields |
|------|---------|---------|------------|
| `system` | `init` | Initialization | `session_id`, `model`, `cwd`, `tools[]`, `mcp_servers[]`, `apiKeySource` |
| `assistant` | — | Assistant reply (text / tool calls) | `session_id`, `message.content[]` — may contain `text` and `tool_use` blocks |
| `user` | — | Tool execution results | `session_id`, `message.content[].type:"tool_result"` |
| `result` | `success` | Conversation ended normally | `session_id`, `duration_ms`, `duration_api_ms`, `total_cost_usd`, `num_turns`, `result`, `usage` |
| `result` | `error` | Conversation ended with error | `is_error: true`, `result` (error message), `permission_denials[]` |

#### Key Format Differences from Cursor

| Aspect | Cursor Agent | Claude Code |
|--------|-------------|-------------|
| Text messages | `type:"assistant"` + `message.content[].type:"text"` | Same structure |
| Tool call start | `type:"tool_call"`, `subtype:"started"` | `type:"assistant"` + `message.content[].type:"tool_use"` |
| Tool call result | `type:"tool_call"`, `subtype:"completed"` | `type:"user"` + `message.content[].type:"tool_result"` |
| Extended result fields | `duration_ms` | `duration_ms`, `duration_api_ms`, `total_cost_usd`, `num_turns`, `usage` |
| ANSI sequences | No (clean stdout since 2026.02+) | No (pure stdout) |
| Mixed content | Never | **A single assistant message can contain both text and tool_use blocks** |

#### Assistant Message Examples

**Pure text reply:**

```json
{"type":"assistant","session_id":"session_01","message":{"id":"msg_1","type":"message","role":"assistant","content":[{"type":"text","text":"Planning next steps."}],"usage":{"input_tokens":120,"output_tokens":45}}}
```

**Tool call:**

```json
{"type":"assistant","session_id":"session_01","message":{"id":"msg_2","type":"message","role":"assistant","content":[{"type":"tool_use","id":"toolu_1","name":"Bash","input":{"command":"ls -la"}}]}}
```

**Tool result (user event):**

```json
{"type":"user","session_id":"session_01","message":{"id":"msg_3","type":"message","role":"user","content":[{"type":"tool_result","tool_use_id":"toolu_1","content":"total 2\nREADME.md\nsrc\n"}]}}
```

The tool result content can be either a string or array format:

```json
{"type":"tool_result","tool_use_id":"toolu_2","content":[{"type":"text","text":"Task completed"}]}
```

#### Result Event Examples

```json
{"type":"result","subtype":"success","session_id":"session_01","total_cost_usd":0.0123,"is_error":false,"duration_ms":12345,"duration_api_ms":12000,"num_turns":2,"result":"Done.","usage":{"input_tokens":150,"output_tokens":70,"service_tier":"standard"}}
```

```json
{"type":"result","subtype":"error","session_id":"session_02","total_cost_usd":0.001,"is_error":true,"duration_ms":2000,"result":"","error":"Permission denied","permission_denials":[{"tool_name":"Bash","tool_use_id":"toolu_9","tool_input":{"command":"git fetch origin main"}}]}
```

#### `--include-partial-messages` Behavior

Without this parameter, `assistant` events contain complete messages (output all at once after each message is finished).
With this parameter, additional `stream_event` type events are output, containing character-level incremental deltas:

```json
{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"Hel"}}}
```

**Streaming event sequence**: `message_start` → `content_block_start` → `content_block_delta` (multiple) → `content_block_stop` → `message_delta` → `message_stop` → finally the complete `assistant` message is output.

**GolemBot Phase 1 does not use** `--include-partial-messages` — the complete message mode is sufficient. Character-level streaming will be added in future iterations.

---

### Session Resume

- `--resume <sessionId>` resumes a specific session
- `--session-id <uuid>` uses a specified UUID as the session ID
- `--continue` / `-c` resumes the most recent session in the current directory
- `--fork-session` forks from an existing session (preserves history but with a different ID)
- session_id can be obtained from the `type: "system"` init event or the `type: "result"` event

**Difference from Cursor**: Cursor can only get session_id from the result event; Claude Code provides it in the system init event.

---

### Authentication Methods

| Method | Use Case | Setup |
|--------|----------|-------|
| `claude auth login` | Local development (recommended) | Browser OAuth flow |
| `ANTHROPIC_API_KEY` environment variable | CI/CD, scripts, headless environments | Obtain from https://console.anthropic.com/settings/keys |
| Cloud Provider (Bedrock/Vertex/Foundry) | Enterprise deployment | Platform-specific environment variable configuration |

**CI/CD scenarios must use API key** — `claude auth login` requires browser interaction.

---

### Skill / CLAUDE.md Mechanism

Claude Code's Skill system differs significantly from Cursor's:

**CLAUDE.md (Project Memory):**

| Location | Purpose | When Loaded |
|----------|---------|-------------|
| `./CLAUDE.md` or `./.claude/CLAUDE.md` | Project-level instructions | Auto-loaded at session start |
| `~/.claude/CLAUDE.md` | Personal-level instructions (all projects) | Auto-loaded at session start |
| `./CLAUDE.local.md` | Personal project-level instructions (not committed to git) | Auto-loaded at session start |

**Skills (`.claude/skills/`):**

- Similar to Cursor's `.cursor/skills/`, each skill is a directory containing `SKILL.md`
- Claude Code auto-discovers skills under `.claude/skills/`
- Skill descriptions are loaded into context at session start; full content is loaded on-demand when used
- Supports frontmatter configuration: `name`, `description`, `disable-model-invocation`, `allowed-tools`, `context: fork`, etc.
- Users can manually trigger via `/skill-name`, or Claude automatically determines when to use them

**GolemBot's skill injection strategy:**

| Engine | Injection Method |
|--------|-----------------|
| Cursor | symlink `skills/<name>` → `.cursor/skills/<name>` |
| Claude Code | Generate `CLAUDE.md` at workspace root (containing skill descriptions and path references) |

---

### Permissions & Security

| Parameter / Setting | Effect |
|--------------------|--------|
| `--dangerously-skip-permissions` | Skip all permission prompts (required for headless) |
| `--allowedTools "Bash,Read,Edit"` | Allow specified tools without confirmation (finer granularity) |
| `--disallowedTools "Edit"` | Disable specified tools |
| `permissions.allow/deny` in settings.json | Persistent permission rules |

**GolemBot uses `--dangerously-skip-permissions`** (equivalent to Cursor's `--force --trust --sandbox disabled`).

---

### Model Configuration

| Alias | Corresponding Model | Use Case |
|-------|---------------------|----------|
| `sonnet` | Sonnet 4.6 (latest) | Day-to-day coding |
| `opus` | Opus 4.6 (latest) | Complex reasoning |
| `haiku` | Haiku | Simple tasks |
| `opusplan` | Opus for planning phase, Sonnet for execution | Mixed mode |

Can be set via `--model <alias>` or the `ANTHROPIC_MODEL` environment variable.

---

### MCP Support

Claude Code loads MCP configuration from `.claude/mcp.json` (not `.cursor/mcp.json`).
The CLI supports `--mcp-config ./mcp.json` to load additional MCP configurations.

---

### GitHub Actions Integration

```yaml
- name: Run Claude Code
  uses: anthropics/claude-code-action@v1
  with:
    prompt: "Your prompt here"
    allowed-tools: "Bash,Read,Edit"
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

---

### Known Pitfalls & GolemBot Adaptation Notes

1. **PTY is not needed** — The biggest difference from Cursor; simple `child_process.spawn` works
2. **No ANSI stripping needed** — stdout is pure JSON, unlike Cursor's PTY output which mixes in ANSI sequences
3. **Mixed content blocks** — A single assistant message may contain both `text` and `tool_use`; they need to be split and processed separately
4. **tool_result is a user event** — Not Cursor's `tool_call.subtype:"completed"`, but a separate `type:"user"` event
5. **session_id is available at init** — No need to wait for the result event to get the session_id
6. **`--verbose` is required** — Without this parameter, stream-json only outputs the final result, not intermediate assistant/user events
7. **result provides more metadata** — `total_cost_usd`, `num_turns`, `duration_api_ms`, `usage` can all be exposed to users
8. **`--dangerously-skip-permissions` is a single parameter** — Unlike Cursor which needs three parameters: `--force --trust --sandbox disabled`
9. **Permission bypass must be explicitly enabled** — You must first enable the option with `--allow-dangerously-skip-permissions`, then activate with `--dangerously-skip-permissions` or `--permission-mode bypassPermissions`. Or use `--dangerously-skip-permissions` directly, which implicitly allows it
10. **Skill paths differ** — Cursor uses `.cursor/skills/`, Claude Code uses `.claude/skills/`; GolemBot must choose the injection method based on the engine

## OpenCode CLI

### Official Documentation

**Core docs:**

- Introduction: https://opencode.ai/docs
- Configuration: https://opencode.ai/docs/config
- CLI Command Reference: https://opencode.ai/docs/cli
- Providers (75+ LLM providers): https://opencode.ai/docs/providers
- Agent System: https://opencode.ai/docs/agents
- Skills (Agent Skills): https://opencode.ai/docs/skills
- Rules (AGENTS.md): https://opencode.ai/docs/rules
- Permissions System: https://opencode.ai/docs/permissions
- Built-in Tools: https://opencode.ai/docs/tools
- Custom Tools: https://opencode.ai/docs/custom-tools
- Model Configuration: https://opencode.ai/docs/models

**Extended capabilities:**

- MCP Servers: https://opencode.ai/docs/mcp-servers
- Plugin System: https://opencode.ai/docs/plugins
- HTTP Server API: https://opencode.ai/docs/server
- Web Interface: https://opencode.ai/docs/web
- ACP Protocol: https://opencode.ai/docs/acp

**Deployment & CI/CD:**

- GitHub Actions: https://opencode.ai/docs/github
- Network / Proxy: https://opencode.ai/docs/network
- Enterprise: https://opencode.ai/docs/enterprise

**Project info:**

- GitHub: https://github.com/anomalyco/opencode (113K+ stars)
- npm package: `opencode-ai`
- Version: v1.1.28 (as of 2026-03)

---

### Core Positioning Difference

**OpenCode is not an "IDE companion CLI" like Cursor/Claude Code — it's a standalone open-source AI coding agent.** It directly calls LLM APIs (via AI SDK + Models.dev), implements its own tool system (bash/read/write/edit/grep/glob, etc.), and manages sessions and context independently.

Key differences from Cursor Agent and Claude Code:

| | Cursor Agent | Claude Code | OpenCode |
|---|---|---|---|
| Nature | CLI mode of Cursor IDE | Anthropic's CLI Agent | Standalone open-source Agent |
| LLM | Cursor backend (with routing) | Anthropic API | 75+ Providers to choose from |
| Tools | Cursor built-in | Claude Code built-in | Custom-built + MCP + custom |

---

### Installation

**Prerequisites**: Node.js >= 18 (for npm) or Go >= 1.22 (for building from source)

**Install via npm** (recommended):

```bash
npm install -g opencode-ai
```

**Alternative — install via Go:**

```bash
go install github.com/anomalyco/opencode@latest
```

**Verify installation:**

```bash
opencode --version
```

---

### Actual Invocation Method (Verified in GolemBot)

**Binary path**: Depends on the Node version manager, e.g., `~/.nvm/versions/node/v22.10.0/bin/opencode`

```bash
opencode run "user message" \
  --format json \
  --model provider/model \
  [--session <sessionId>] \
  [--continue] \
  [--agent <agentName>] \
  [--attach http://localhost:4096]
```

**PTY is not needed**. OpenCode is a standard CLI; a regular `child_process.spawn()` works (same as Claude Code).

**Key parameter descriptions:**

| Parameter | Effect | Notes |
|-----------|--------|-------|
| `--format json` | Output raw JSON events (NDJSON) | Replaces the default formatted text output |
| `--model provider/model` | Specify model (e.g., `anthropic/claude-sonnet-4-5`) | Format is `provider/model`, unlike Claude Code's aliases |
| `--session <id>` | Resume a specific session | Session ID format: `ses_XXXXXXXX` |
| `--continue` / `-c` | Resume most recent session | |
| `--fork` | Fork session (preserves history but with new ID) | Must be combined with `--session` or `--continue` |
| `--agent <name>` | Specify Agent (e.g., `build`, `plan`) | Default is `build` (full-featured) |
| `--attach <url>` | Connect to a running serve instance | Avoids cold start, recommended for production |
| `--port <n>` | Specify local server port | Default is random port |

---

### JSON Output Format (`--format json`)

`opencode run --format json` outputs NDJSON. **The event structure is completely different from Cursor/Claude Code's stream-json.**

#### Observed Event Types

**Error events:**

```json
{
  "type": "error",
  "timestamp": 1772335804867,
  "sessionID": "ses_3588dd885ffeJynG8QZsSrpPiL",
  "error": {
    "name": "APIError",
    "data": {
      "message": "Your credit balance is too low...",
      "statusCode": 400,
      "isRetryable": false
    }
  }
}
```

**Session data structure** (full format obtained via `opencode export <sessionId>`):

```json
{
  "info": {
    "id": "ses_XXX",
    "title": "...",
    "time": { "created": 1772335636895, "updated": 1772335640665 }
  },
  "messages": [
    {
      "info": {
        "id": "msg_XXX",
        "role": "user|assistant",
        "agent": "build",
        "model": { "providerID": "...", "modelID": "..." },
        "cost": 0,
        "tokens": {
          "input": 11103, "output": 35, "reasoning": 33,
          "cache": { "read": 397, "write": 0 }
        },
        "finish": "stop"
      },
      "parts": [
        { "type": "text", "text": "..." },
        { "type": "step-start" },
        { "type": "reasoning", "text": "...", "time": { "start": ..., "end": ... } },
        { "type": "step-finish", "reason": "stop", "cost": 0, "tokens": { ... } }
      ]
    }
  ]
}
```

**Message parts type overview:**

| part.type | Meaning | Key Fields |
|-----------|---------|------------|
| `text` | Text content | `text`, `time` |
| `step-start` | Reasoning step started | |
| `step-finish` | Reasoning step ended | `reason`, `cost`, `tokens` |
| `reasoning` | Reasoning process (chain of thought) | `text`, `time` |
| `tool-invocation` | Tool call | `toolName`, `args`, `result` |

**Format differences from Cursor/Claude Code:**

| Aspect | Cursor | Claude Code | OpenCode |
|--------|--------|-------------|----------|
| Streaming format | `--output-format stream-json` | `--output-format stream-json` | `--format json` |
| Text events | `type:"assistant"` | `type:"assistant"` + `content[].type:"text"` | part.type: `text` |
| Tool calls | `type:"tool_call"` + started/completed | `type:"assistant"` + tool_use block | part.type: `tool-invocation` |
| End events | `type:"result"` | `type:"result"` | step-finish (with cost/tokens) |
| Error events | `type:"result"` + `is_error:true` | `type:"result"` + `is_error:true` | `type:"error"` + error object |
| Metadata | `duration_ms` | `duration_ms`, `total_cost_usd`, `num_turns` | `cost`, `tokens` (with reasoning + cache breakdown) |
| ANSI | No (clean stdout since 2026.02+) | No | No |

**Note**: The streaming event structure above has been verified through real-world testing with OpenRouter + Anthropic models. The `OpenCodeEngine` in GolemBot has been fully implemented and passes e2e tests. Key observation: OpenCode sends text content in full chunks (not character-level deltas), similar to Claude Code's behavior without `--include-partial-messages`.

---

### Alternative: Integration via HTTP Server API

OpenCode provides a full HTTP Server (OpenAPI 3.1 spec), giving GolemBot **two integration approaches**:

**Approach A: CLI mode** (same as Cursor/Claude Code)
```bash
opencode run --format json "prompt"
```

**Approach B: HTTP Server mode** (OpenCode exclusive)
```bash
opencode serve --port 4096
# → POST /session/:id/message { parts: [{ type: "text", text: "prompt" }] }
# → GET /event (SSE stream)
```

Key HTTP Server API endpoints:

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/session` | Create new session |
| `POST` | `/session/:id/message` | Send message (synchronous, waits for completion) |
| `POST` | `/session/:id/prompt_async` | Send message asynchronously |
| `POST` | `/session/:id/abort` | Abort a running session |
| `GET` | `/session/:id/message` | Get message list |
| `GET` | `/event` | SSE event stream |
| `GET` | `/global/health` | Health check |
| `DELETE` | `/session/:id` | Delete session |
| `POST` | `/session/:id/fork` | Fork session |
| `POST` | `/session/:id/share` | Share session |

Advantages of HTTP mode: avoids the cold start of each `opencode run` (5-10s), reusing a single server instance for multiple conversations.

---

### Session Management

| Operation | CLI Command | Description |
|-----------|------------|-------------|
| List sessions | `opencode session list --format json` | Returns JSON array |
| Resume session | `opencode run --session <id> "message"` | |
| Resume most recent | `opencode run --continue "message"` | |
| Fork session | `opencode run --session <id> --fork "message"` | |
| Export session | `opencode export <id>` | Full JSON (all messages and parts) |
| Import session | `opencode import <file\|url>` | |
| Delete session | HTTP: `DELETE /session/:id` | No direct CLI command yet |
| View statistics | `opencode stats` | Token usage and cost statistics |

**Session ID format**: `ses_XXXXXXXXXXXXXXXX` (different from Cursor/Claude Code's UUID format)

---

### Authentication Methods

OpenCode supports 75+ LLM Providers; the authentication method depends on the chosen Provider:

| Method | Use Case | Setup |
|--------|----------|-------|
| `opencode auth login` / `/connect` | Local development | Interactive within TUI, credentials stored to `~/.local/share/opencode/auth.json` |
| Provider environment variables | CI/CD, scripts | `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, etc. |
| OpenCode Zen / Go | Official hosted Provider | Unified API Key, verified by the OpenCode team |
| `.env` file | Project-level config | OpenCode auto-loads `.env` from the project directory at startup |

**Common Provider environment variables:**

| Provider | Environment Variable | Model Format Example |
|----------|---------------------|---------------------|
| Anthropic | `ANTHROPIC_API_KEY` | `anthropic/claude-sonnet-4-5` |
| OpenAI | `OPENAI_API_KEY` | `openai/gpt-5` |
| Google | `GOOGLE_GENERATIVE_AI_API_KEY` | `google/gemini-2.5-pro` |
| OpenRouter | `OPENROUTER_API_KEY` | `openrouter/anthropic/claude-sonnet-4-5` |
| Amazon Bedrock | `AWS_*` series | `amazon-bedrock/...` |

**Difference from Cursor/Claude Code**: Cursor only needs `CURSOR_API_KEY`, Claude Code only needs `ANTHROPIC_API_KEY`. Because OpenCode supports multiple Providers, you must set the environment variable **corresponding to the chosen Provider**. When integrating with GolemBot's `InvokeOpts.apiKey`, you need to know the target Provider to set the correct environment variable name.

---

### Skill Mechanism

OpenCode's Skill system is highly compatible with Claude Code. Search paths:

| Location | Scope | Description |
|----------|-------|-------------|
| `.opencode/skills/*/SKILL.md` | Project-level | OpenCode native path |
| `.claude/skills/*/SKILL.md` | Project-level | Claude Code compatible (can be disabled via `OPENCODE_DISABLE_CLAUDE_CODE_SKILLS=1`) |
| `.agents/skills/*/SKILL.md` | Project-level | Universal standard path |
| `~/.config/opencode/skills/*/SKILL.md` | Global | User-level |
| `~/.claude/skills/*/SKILL.md` | Global | Claude Code compatible |
| `~/.agents/skills/*/SKILL.md` | Global | Universal standard |

**Skill discovery mechanism**: OpenCode traverses upward from the current directory to the git worktree root, loading all matching `skills/*/SKILL.md` along the way.

**On-demand loading**: At Agent startup, only Skill names and descriptions are visible (injected into the `skill` tool description); full content is loaded when the Agent decides to use it via the `skill({ name: "xxx" })` tool call.

**SKILL.md frontmatter requirements:**

```yaml
---
name: git-release          # Required, must match directory name, lowercase + hyphens
description: Create releases  # Required, 1-1024 characters
license: MIT               # Optional
compatibility: opencode    # Optional
metadata:                  # Optional, string-to-string map
  audience: maintainers
---
```

**GolemBot's injection strategy options:**
- Option 1: symlink to `.opencode/skills/` (most canonical)
- Option 2: symlink to `.agents/skills/` (universal standard, other Agents can read it in the future)
- Option 3: reuse Claude Code's `.claude/skills/` symlink (OpenCode reads it compatibly)

---

### Rules / AGENTS.md

OpenCode's rules system is perfectly compatible with GolemBot's `AGENTS.md` generation mechanism:

| Location | Priority | Description |
|----------|----------|-------------|
| `AGENTS.md` (project root) | High | OpenCode native, takes precedence over CLAUDE.md |
| `CLAUDE.md` (project root) | Low | Only used when there is no AGENTS.md |
| `~/.config/opencode/AGENTS.md` | Global | User-level rules |
| `~/.claude/CLAUDE.md` | Global fallback | Only used when there is no global AGENTS.md |

**Additional instruction files**: The `instructions` field in `opencode.json` can reference extra files (supports globs and remote URLs):

```json
{ "instructions": ["CONTRIBUTING.md", "docs/guidelines.md", ".cursor/rules/*.md"] }
```

**Implications for GolemBot**: The `AGENTS.md` generated by GolemBot during `init` is automatically consumed by OpenCode — no additional configuration needed.

---

### Permissions System

OpenCode permissions are configured via `opencode.json`, with finer granularity than Cursor/Claude Code:

```json
{
  "permission": {
    "*": "allow",
    "bash": { "*": "ask", "git *": "allow", "rm *": "deny" },
    "edit": { "*": "allow", "*.env": "deny" }
  }
}
```

Three levels: `"allow"` (auto-execute), `"ask"` (request approval), `"deny"` (forbidden)

**Default permissions**: Most operations default to `"allow"`; only `.env` files default to `"deny"`. **No parameter equivalent to `--dangerously-skip-permissions` is needed.**

**Headless mode status (v1.1.28):**
- `opencode run` in non-interactive mode has known bugs ([PR #14607](https://github.com/anomalyco/opencode/pull/14607), not yet merged)
- Bug 1: `question` tool hangs in non-interactive mode (session deny rules not propagated to tool filter layer)
- Bug 2: Permissions configured as `"ask"` auto-reject in non-interactive mode, causing tool failures
- **Fix (in PR)**: `"ask"` permissions auto-approve in non-interactive mode; adds `--no-auto-approve` flag
- **Current workaround**: Set all permissions to `allow` via `OPENCODE_PERMISSION='{"*":"allow"}'` or `opencode.json`

---

### Agent System

OpenCode has a built-in Agent hierarchy (GolemBot can leverage it via the `--agent` parameter):

**Primary Agents:**
- `build` — Default, full-featured (can read/write files, execute commands)
- `plan` — Read-only mode, analyze and plan but don't modify files

**Subagents:**
- `general` — General purpose, can execute multiple tasks in parallel
- `explore` — Read-only, fast code search

Custom Agents are supported: define via the `agent` field in `opencode.json` or `.opencode/agents/*.md` files.

---

### MCP Support

Configured via `opencode.json` (not `.cursor/mcp.json` or `.claude/mcp.json`):

```json
{
  "mcp": {
    "my-server": {
      "type": "local",
      "command": ["npx", "-y", "my-mcp-command"],
      "enabled": true
    },
    "remote-server": {
      "type": "remote",
      "url": "https://mcp.example.com/mcp"
    }
  }
}
```

Supports two types: local (command spawn) and remote (URL + optional OAuth).

---

### Plugin System

OpenCode provides a full plugin hook mechanism (neither Cursor nor Claude Code has this capability):

```typescript
export const MyPlugin = async ({ project, client, $ }) => ({
  "tool.execute.before": async (input, output) => { /* Before tool execution */ },
  "tool.execute.after": async (input, output) => { /* After tool execution */ },
  event: async ({ event }) => { /* Event listener */ },
});
```

Plugins are placed in `.opencode/plugins/` (project-level) or `~/.config/opencode/plugins/` (global), and can also be installed as npm packages.

---

### GitHub Actions Integration

```yaml
- uses: anomalyco/opencode/github@latest
  with:
    model: anthropic/claude-sonnet-4-20250514
    # prompt: "optional custom prompt"
    # agent: "build"
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

Supported trigger events: `issue_comment` (/opencode or /oc), `pull_request_review_comment`, `issues`, `pull_request`, `schedule`, `workflow_dispatch`

---

### Configuration Files

| File | Location | Content |
|------|----------|---------|
| `opencode.json` | Project root directory | Project-level config (models, permissions, MCP, Agents, tools, etc.) |
| `opencode.json` | `~/.config/opencode/` | Global config |
| `auth.json` | `~/.local/share/opencode/` | Provider credentials |
| `.opencode/agents/*.md` | Project-level | Custom Agents |
| `.opencode/plugins/*.ts` | Project-level | Custom plugins |
| `.opencode/tools/*.ts` | Project-level | Custom tools |
| `.opencode/skills/*/SKILL.md` | Project-level | Skill definitions |

Configuration precedence (later overrides earlier): remote config → global → project → custom path → `OPENCODE_CONFIG_CONTENT` environment variable

---

### Known Pitfalls & GolemBot Adaptation Notes

1. **Slow cold start (5-10s)** — OpenCode loads Provider configs, MCP servers, etc. at startup, much slower than Cursor/Claude Code. For production, use `opencode serve` + `--attach` mode to reuse a server instance
2. **`--format json` event structure is completely different from Cursor/Claude Code** — Cannot reuse `parseStreamLine()` or `parseClaudeStreamLine()`; requires an independent `parseOpenCodeStreamLine()`
3. **Headless mode has known bugs** — In v1.1.28, `opencode run`'s question tool may hang, and `"ask"` permissions auto-reject. Recommend explicitly setting `permission: "allow"` as a workaround
4. **Multi-Provider authentication is complex** — Unlike Cursor/Claude Code which each need only one environment variable, OpenCode requires the API Key corresponding to the chosen Provider. When integrating with GolemBot's `InvokeOpts.apiKey`, you need to know the target Provider to set the correct environment variable name
5. **Skill multi-path auto-discovery** — OpenCode simultaneously reads `.opencode/skills/`, `.claude/skills/`, `.agents/skills/`. If GolemBot injects skills for both Claude Code and OpenCode, there's no conflict (identical Skills are only loaded once)
6. **AGENTS.md auto-consumption** — The AGENTS.md generated by GolemBot during init is automatically consumed by OpenCode — a positive compatibility feature
7. **Session ID format is different** — `ses_XXXXXXXX` instead of UUID; GolemBot's session storage layer needs to accommodate this
8. **HTTP Server API is a better integration approach** — Compared to CLI spawn mode, HTTP mode eliminates cold start, supports abort operations (`POST /session/:id/abort`), and may be a better Engine implementation
9. **`opencode.json` needs to be generated during init** — Similar to Cursor's `.cursor/cli.json`, OpenCode's project config needs to be generated during workspace initialization
10. **OpenCode iterates extremely fast** — As of 2026-03, it's at v1.1.28; the API may change frequently, so keep an eye on the changelog

---

## Codex CLI

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

### Actual Invocation Method (Verified for GolemBot)

Non-interactive headless invocation for GolemBot integration:

```bash
codex exec --json --full-auto --model codex-mini-latest "prompt here"
```

Key flags:

| Flag | Purpose |
|------|---------|
| `--json` | Emit JSONL event stream to stdout (machine-readable) |
| `--full-auto` | Shortcut: `--sandbox workspace-write --ask-for-approval on-request` |
| `--dangerously-bypass-approvals-and-sandbox` / `--yolo` | Disable ALL safety checks — use only inside isolated containers |
| `--model <id>` | Override model |
| `--cd <path>` | Set working directory before processing |
| `--ephemeral` | Skip session persistence |

**Flag placement:** Global flags must appear **after** the subcommand:
```bash
codex exec --json --full-auto "prompt"   # ✅ correct
codex --json exec "prompt"               # ❌ wrong
```

**stdout vs stderr split (critical for integration):**
- `stdout` — pure JSONL events (only when `--json` is set)
- `stderr` — config summary, progress indicators, warnings

Spawn with `stdio: ['pipe', 'pipe', 'pipe']` and consume stdout/stderr independently.

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
```

**Known limitation (GitHub issue #5028, PR #4525):** `mcp_tool_call` items do **not** include tool arguments or results in the `--json` output — only the server/tool name. This was a deliberate change that broke some integrations. Full tool traces are only available via the App Server protocol.

### Session Resume

Sessions stored under `~/.codex/sessions/` (or `$CODEX_HOME/sessions/`).

```bash
# Resume specific session (non-interactive)
codex exec resume <SESSION_ID> "continue the refactor"

# Resume most recent session (non-interactive)
codex exec resume --last "next step"

# Also consider all directories (not just cwd)
codex exec resume --last --all "next step"
```

**Capturing the session ID:** The `thread_id` from `thread.started` event is the only programmatic way to obtain the session ID. There is no separate env var or flag for it (open feature request: issue #8923).

**Resume prefix for GolemBot:** When sessionId is known, invoke:
```bash
codex exec --json --full-auto resume <SESSION_ID> "prompt"
```

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
| `OPENAI_API_KEY` | Primary API key for API-auth mode |
| `CODEX_API_KEY` | Alternate accepted by CI/CD docs |
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

**Known quirk (issues #2638, #3286):** If both ChatGPT session and `OPENAI_API_KEY` are present, behavior may be inconsistent across versions. For CI/CD, explicitly log in with API key to avoid ambiguity.

### Skill Auto-Discovery Mechanism (AGENTS.md)

Codex reads `AGENTS.md` files before doing any work. Discovery order:

1. **Global** (`~/.codex/`): `AGENTS.override.md` → `AGENTS.md`
2. **Project** (Git root down to cwd): walks each level, reads `AGENTS.override.md` → `AGENTS.md` → configured fallback filenames
3. **Merge**: files concatenate root → innermost; inner overrides outer

Configuration in `~/.codex/config.toml`:
```toml
project_doc_fallback_filenames = ["TEAM_GUIDE.md", ".agents.md"]
project_doc_max_bytes = 65536    # default 32 KiB per file
```

**For GolemBot:** Place the generated `AGENTS.md` (assembled from skill SKILL.md files) in the workspace root — Codex will auto-discover it.

**Protected directories (always read-only, even in workspace-write mode):**
- `.git/`
- `.agents/`
- `.codex/`

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

### Model Configuration

Models as of early 2026 (subject to change; check https://developers.openai.com/codex/models/):

| Model ID | Description |
|----------|-------------|
| `codex-1` | o3-based, tuned for software engineering (initial release model) |
| `codex-mini-latest` | o4-mini-based, low-latency, cost-effective |

Newer model IDs (may vary; verify from live docs):
- `gpt-5.2-codex`, `gpt-5.3-codex` — advanced agentic coding
- `gpt-5.1-codex-max` — long-horizon tasks

**Switching model:**
```bash
codex exec --model codex-mini-latest --json "your task"
```

Or in `~/.codex/config.toml`:
```toml
model = "codex-mini-latest"
```

### Known Pitfalls & GolemBot Adaptation Notes

1. **`--json` flag placement**: Must come after `exec` subcommand — `codex exec --json`, not `codex --json exec`.

2. **Tool call args missing (#5028)**: `mcp_tool_call` items in `--json` output don't include arguments or results. Only tool name is available. Use App Server protocol for full traces.

3. **Session ID only in JSONL stream**: `thread_id` from `thread.started` event is the only way to capture session ID programmatically. No env var for it (issue #8923).

4. **Auth conflict with dual credentials**: Both ChatGPT session + `OPENAI_API_KEY` can cause unpredictable auth behavior. For CI, use `codex login --with-api-key` explicitly.

5. **`codex exec` default auto-cancels approvals**: Without `--full-auto`, the agent auto-cancels any permission escalation requests in headless mode — tasks requiring elevated permissions silently fail. Always use `--full-auto` for GolemBot integration.

6. **No `--session-key` concept**: Sessions are identified by internal UUIDs stored in `~/.codex/sessions/`. GolemBot must capture `thread_id` from `thread.started` and persist it as sessionId.

7. **TTY echo bug (#3646)**: Interactive `sudo` prompts inside agent-executed commands can hang the terminal. Avoid sudo in prompts.

8. **Sandbox bypass in zsh (patched v0.106.0)**: A `zsh-fork` execution path could drop sandbox wrappers. Patched in Feb 2026.

9. **Input size cap**: Shared ~1M-character input cap as of v0.106.0 to prevent hangs on oversized inputs.

10. **Rapid release pace**: Codex CLI iterates fast; verify flag syntax against the installed version's `codex exec --help` output before relying on it in CI.

---

## Four-Engine Comparison Matrix (Cursor vs Claude Code vs OpenCode vs Codex)

### Basic Properties

| Dimension | Cursor Agent | Claude Code | OpenCode | Codex CLI |
|-----------|-------------|-------------|----------|-----------|
| Type | IDE companion CLI | Official CLI Agent | Standalone open-source Agent | OpenAI official CLI Agent |
| Open source | No | No | Yes (Apache-2.0) | Yes (Apache-2.0, Rust) |
| LLM support | Cursor backend (with routing) | Anthropic models only | 75+ Providers | OpenAI models (codex-1, codex-mini-latest, etc.) |
| Installation | `curl https://cursor.com/install -fsS \| bash` | `npm i -g @anthropic-ai/claude-code` | `npm i -g opencode-ai` | `npm i -g @openai/codex` |
| Binary name | `agent` | `claude` | `opencode` | `codex` |
| PTY requirement | Not needed (`child_process.spawn`) | Not needed (`child_process.spawn`) | Not needed (`child_process.spawn`) | Not needed (`child_process.spawn`) |

### Invocation Methods

| Dimension | Cursor Agent | Claude Code | OpenCode | Codex CLI |
|-----------|-------------|-------------|----------|-----------|
| Non-interactive command | `agent -p "prompt"` | `claude -p "prompt"` | `opencode run "prompt"` | `codex exec "prompt"` |
| JSON output flag | `--output-format stream-json` | `--output-format stream-json` | `--format json` | `--json` (flag after `exec`) |
| Model selection | `--model <alias>` | `--model <alias>` | `--model provider/model` | `--model <id>` |
| Permission bypass | `--force --trust --sandbox disabled` | `--dangerously-skip-permissions` | Permission config `"*": "allow"` | `--full-auto` or `--yolo` |
| Core headless params | `--approve-mcps` | `--dangerously-skip-permissions` | Permission config `"*": "allow"` | `--full-auto` |
| Verbose output | Default | `--verbose` (required) | Default | Goes to stderr automatically |

### Session Management

| Dimension | Cursor Agent | Claude Code | OpenCode | Codex CLI |
|-----------|-------------|-------------|----------|-----------|
| Resume specific session | `--resume <uuid>` | `--resume <uuid>` | `--session <ses_xxx>` | `codex exec resume <thread_id> "prompt"` |
| Resume most recent | `--resume` | `--continue` | `--continue` | `codex exec resume --last "prompt"` |
| Fork session | Not supported | `--fork-session` | `--fork` | `codex fork` (TUI only) |
| Export session | Not supported | Not supported | `opencode export <id>` | Not supported |
| Session ID format | UUID | UUID | `ses_XXXXXXXX` | UUID (`thread_id` from `thread.started` event) |
| Session storage | `~/.cursor/` | `~/.claude/` | `~/.local/share/opencode/` | `~/.codex/sessions/` |
| Skip persistence | Not supported | Not supported | Not supported | `--ephemeral` |

### Authentication

| Dimension | Cursor Agent | Claude Code | OpenCode | Codex CLI |
|-----------|-------------|-------------|----------|-----------|
| API Key variable | `CURSOR_API_KEY` | `ANTHROPIC_API_KEY` | Depends on Provider | `OPENAI_API_KEY` / `CODEX_API_KEY` |
| Local login | `agent login` (browser OAuth) | `claude auth login` | `opencode auth login` | `codex login` (browser or `--with-api-key`) |
| Max subscription support | Native (Cursor Pro) | OAuth + `apiKeyHelper` | Not applicable | ChatGPT subscription (OAuth) |
| CI/CD auth | `CURSOR_API_KEY` | `ANTHROPIC_API_KEY` | Provider-specific env var | `printenv OPENAI_API_KEY \| codex login --with-api-key` |
| OpenRouter | Not supported | Not natively supported | Natively supported (`OPENROUTER_API_KEY`) | Not supported |

### Skill / Rules System

| Dimension | Cursor Agent | Claude Code | OpenCode | Codex CLI |
|-----------|-------------|-------------|----------|-----------|
| Skill path | `.cursor/skills/` | `.claude/skills/` | `.opencode/skills/` + `.claude/skills/` + `.agents/skills/` | No dedicated skill path |
| Rules file | `.cursor/rules/*.mdc` | `CLAUDE.md` | `AGENTS.md` (preferred) / `CLAUDE.md` | `AGENTS.md` (auto-discovered root → cwd) |
| Rules fallback config | Not supported | Not supported | Not supported | `project_doc_fallback_filenames` in `config.toml` |
| Skill format | `SKILL.md` | `SKILL.md` | `SKILL.md` (with frontmatter) | No dedicated format (embed in AGENTS.md) |
| On-demand loading | Yes (Agent auto) | Yes (Agent auto) | Yes (via `skill()` tool) | Not applicable |
| Global skills | `~/.cursor/skills/` | `~/.claude/skills/` | `~/.config/opencode/skills/` | `~/.codex/AGENTS.md` |

### Tools & Extensions

| Dimension | Cursor Agent | Claude Code | OpenCode | Codex CLI |
|-----------|-------------|-------------|----------|-----------|
| Built-in tools | IDE integrated | bash/read/write/edit/grep, etc. | bash/read/write/edit/grep/glob, etc. | bash/read/write/edit, etc. |
| MCP support | `.cursor/mcp.json` | `.claude/mcp.json` | `opencode.json` | `~/.codex/config.toml` (via `mcp` command) |
| Web search | Not supported | Not supported | Not supported | `--search` flag |
| Image input | Not supported | Not supported | Not supported | `--image <path>` |
| Subagents | Not supported | Not supported | `explore`, `general` (parallelizable) | Codex Cloud (async tasks) |
| GitHub Actions | Supported (`curl https://cursor.com/install`) | Supported (official Action) | Supported (official Action) | Supported (`npm i -g @openai/codex`) |
| HTTP Server API | Not supported | Not supported | Full OpenAPI (`opencode serve`) | App Server (JSON-RPC 2.0 over stdio) |
| TypeScript SDK | Not supported | Not supported | Not supported | `@openai/codex-sdk` (Node 18+) |

### GolemBot Engine Integration Methods

| Dimension | CursorEngine | ClaudeCodeEngine | OpenCodeEngine | CodexEngine |
|-----------|-------------|-----------------|----------------|-------------|
| Spawn method | `child_process.spawn` | `child_process.spawn` | `child_process.spawn` | `child_process.spawn` |
| Parser function | `parseStreamLine()` | `parseClaudeStreamLine()` | `parseOpenCodeStreamLine()` | `parseCodexStreamLine()` |
| Skill injection | symlink → `.cursor/skills/` | symlink → `.claude/skills/` + `CLAUDE.md` | symlink → `.opencode/skills/` | Embed skills content into `AGENTS.md` at workspace root |
| Config generation | `.cursor/cli.json` | `CLAUDE.md` | `opencode.json` | `~/.codex/config.toml` (optional) |
| API Key injection | `CURSOR_API_KEY` | `ANTHROPIC_API_KEY` | Provider-specific env var | `OPENAI_API_KEY` |
| Session ID source | `done` event `sessionId` field | `done` event `sessionId` field | `done` event `sessionId` field | `thread.started` event `thread_id` field |
| Cold start | Fast (~1s) | Moderate (~2-3s) | Slow (5-10s, HTTP serve mode recommended) | Moderate (~2-3s) |
| Cost tracking | `duration_ms` | `total_cost_usd` + `num_turns` | `cost` + `tokens` (with cache breakdown) | `turn.completed` `usage.input_tokens` + `usage.output_tokens` |
