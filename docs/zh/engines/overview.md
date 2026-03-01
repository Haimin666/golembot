# 引擎概览

GolemBot 支持三种 Coding Agent 引擎。三者对外暴露相同的 `StreamEvent` 接口 — 切换引擎只需改一行配置。

## 对比

| | Cursor | Claude Code | OpenCode |
|---|---|---|---|
| 二进制 | `agent` | `claude` | `opencode` |
| 输出格式 | stream-json | stream-json | NDJSON |
| 技能注入 | `.cursor/skills/` | `.claude/skills/` + `CLAUDE.md` | `.opencode/skills/` + `opencode.json` |
| 会话恢复 | `--resume <id>` | `--resume <id>` | `--session <id>` |
| API Key | `CURSOR_API_KEY` | `ANTHROPIC_API_KEY` | 取决于 Provider |
| 权限跳过 | `--force --trust --sandbox disabled` | `--dangerously-skip-permissions` | `opencode.json` 权限配置 |
| 费用追踪 | — | `costUsd`、`numTurns` | `costUsd`（累计） |

## 统一的 StreamEvent

无论使用哪个引擎，`assistant.chat()` 都产出相同的事件类型：

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

## 如何选择

- **Cursor** — 如果你已经在用 Cursor IDE 并有订阅
- **Claude Code** — 综合体验最佳；提供费用和轮次追踪
- **OpenCode** — 开源，支持多 LLM Provider（Anthropic、OpenAI、OpenRouter 等）
