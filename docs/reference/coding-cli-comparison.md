# Four-Engine Comparison Matrix

Cursor vs Claude Code vs OpenCode vs Codex — side-by-side reference for all GolemBot-supported engines.

## Basic Properties

| Dimension | Cursor Agent | Claude Code | OpenCode | Codex CLI |
|-----------|-------------|-------------|----------|-----------|
| Type | IDE companion CLI | Official CLI Agent | Standalone open-source Agent | OpenAI official CLI Agent |
| Open source | No | No | Yes (Apache-2.0) | Yes (Apache-2.0, Rust) |
| LLM support | Cursor backend (with routing) | Anthropic models only | 75+ Providers | OpenAI models (codex-1, codex-mini-latest, etc.) |
| Installation | `curl https://cursor.com/install -fsS \| bash` | `npm i -g @anthropic-ai/claude-code` | `npm i -g opencode-ai` | `npm i -g @openai/codex` |
| Binary name | `agent` | `claude` | `opencode` | `codex` |
| PTY requirement | Not needed (`child_process.spawn`) | Not needed (`child_process.spawn`) | Not needed (`child_process.spawn`) | Not needed (`child_process.spawn`) |

## Invocation Methods

| Dimension | Cursor Agent | Claude Code | OpenCode | Codex CLI |
|-----------|-------------|-------------|----------|-----------|
| Non-interactive command | `agent -p "prompt"` | `claude -p "prompt"` | `opencode run "prompt"` | `codex exec "prompt"` |
| JSON output flag | `--output-format stream-json` | `--output-format stream-json` | `--format json` | `--json` (flag after `exec`) |
| Model selection | `--model <alias>` | `--model <alias>` | `--model provider/model` | `--model <id>` |
| Permission bypass | `--force --trust --sandbox disabled` | `--dangerously-skip-permissions` | Permission config `"*": "allow"` | `--dangerously-bypass-approvals-and-sandbox` (default in GolemBot) or `--full-auto` |
| Core headless params | `--approve-mcps` | `--dangerously-skip-permissions` | Permission config `"*": "allow"` | `--dangerously-bypass-approvals-and-sandbox` or `--full-auto` |
| Verbose output | Default | `--verbose` (required) | Default | Goes to stderr automatically |

## Session Management

| Dimension | Cursor Agent | Claude Code | OpenCode | Codex CLI |
|-----------|-------------|-------------|----------|-----------|
| Resume specific session | `--resume <uuid>` | `--resume <uuid>` | `--session <ses_xxx>` | `codex exec resume <thread_id> "prompt"` |
| Resume most recent | `--resume` | `--continue` | `--continue` | `codex exec resume --last "prompt"` |
| Fork session | Not supported | `--fork-session` | `--fork` | `codex fork` (TUI only) |
| Export session | Not supported | Not supported | `opencode export <id>` | Not supported |
| Session ID format | UUID | UUID | `ses_XXXXXXXX` | UUID (`thread_id` from `thread.started` event) |
| Session storage | `~/.cursor/` | `~/.claude/` | `~/.local/share/opencode/` | `~/.codex/sessions/` |
| Skip persistence | Not supported | Not supported | Not supported | `--ephemeral` |

## Authentication

| Dimension | Cursor Agent | Claude Code | OpenCode | Codex CLI |
|-----------|-------------|-------------|----------|-----------|
| API Key variable | `CURSOR_API_KEY` | `ANTHROPIC_API_KEY` | Depends on Provider | `OPENAI_API_KEY` / `CODEX_API_KEY` |
| Local login | `agent login` (browser OAuth) | `claude auth login` | `opencode auth login` | `codex login` (browser or `--with-api-key`) |
| Subscription support | Native (Cursor Pro) | OAuth + `apiKeyHelper` | Not applicable | ChatGPT subscription (OAuth) |
| CI/CD auth | `CURSOR_API_KEY` | `ANTHROPIC_API_KEY` | Provider-specific env var | `printenv OPENAI_API_KEY \| codex login --with-api-key` |
| OpenRouter | Not supported | Not natively supported | Natively supported (`OPENROUTER_API_KEY`) | Not supported |

## Skill / Rules System

| Dimension | Cursor Agent | Claude Code | OpenCode | Codex CLI |
|-----------|-------------|-------------|----------|-----------|
| Skill path | `.cursor/skills/` | `.claude/skills/` | `.opencode/skills/` + `.claude/skills/` + `.agents/skills/` | `.agents/skills/` |
| Rules file | `.cursor/rules/*.mdc` | `CLAUDE.md` | `AGENTS.md` (preferred) / `CLAUDE.md` | `AGENTS.md` (auto-discovered root → cwd) |
| Rules fallback config | Not supported | Not supported | Not supported | `project_doc_fallback_filenames` in `config.toml` |
| Skill format | `SKILL.md` | `SKILL.md` | `SKILL.md` (with frontmatter) | `SKILL.md` (in `.agents/skills/`) + `AGENTS.md` |
| On-demand loading | Yes (Agent auto) | Yes (Agent auto) | Yes (via `skill()` tool) | Not applicable |
| Global skills | `~/.cursor/skills/` | `~/.claude/skills/` | `~/.config/opencode/skills/` | `~/.codex/AGENTS.md` |

## Tools & Extensions

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

## GolemBot Engine Integration

| Dimension | CursorEngine | ClaudeCodeEngine | OpenCodeEngine | CodexEngine |
|-----------|-------------|-----------------|----------------|-------------|
| Spawn method | `child_process.spawn` | `child_process.spawn` | `child_process.spawn` | `child_process.spawn` |
| Parser function | `parseStreamLine()` | `parseClaudeStreamLine()` | `parseOpenCodeStreamLine()` | `parseCodexStreamLine()` |
| Skill injection | symlink → `.cursor/skills/` | symlink → `.claude/skills/` + `CLAUDE.md` | symlink → `.opencode/skills/` | symlink → `.agents/skills/` + `AGENTS.md` |
| Config generation | `.cursor/cli.json` | `CLAUDE.md` | `opencode.json` | `~/.codex/config.toml` (optional) |
| API Key injection | `CURSOR_API_KEY` | `ANTHROPIC_API_KEY` | Provider-specific env var | `OPENAI_API_KEY` |
| Session ID source | `done` event `sessionId` field | `done` event `sessionId` field | `done` event `sessionId` field | `thread.started` event `thread_id` field |
| Cold start | Fast (~1s) | Moderate (~2-3s) | Slow (5-10s, HTTP serve mode recommended) | Moderate (~2-3s) |
| Cost tracking | `duration_ms` | `total_cost_usd` + `num_turns` | `cost` + `tokens` (with cache breakdown) | `usage.input_tokens` + `usage.output_tokens` (no cost) |
