# OpenCode 引擎

OpenCode 引擎调用 `opencode` CLI，支持多种 LLM Provider。

## 前置条件

- 安装 OpenCode：`opencode` 在 PATH 中可用
- 设置所选 Provider 的 API Key

## 配置

```yaml
name: my-bot
engine: opencode
model: anthropic/claude-sonnet   # 可选，provider/model 格式
```

## 多 Provider 支持

OpenCode 支持多种 LLM Provider。GolemBot 根据模型前缀自动解析正确的 API Key 环境变量：

| 模型前缀 | 环境变量 |
|----------|----------|
| `anthropic/` | `ANTHROPIC_API_KEY` |
| `openai/` | `OPENAI_API_KEY` |
| `openrouter/` | `OPENROUTER_API_KEY` |
| `groq/` | `GROQ_API_KEY` |
| `azure/` | `AZURE_API_KEY` |

## 技能注入

技能通过符号链接注入到 `.opencode/skills/`。同时写入或更新 `opencode.json`，配置权限和模型：

```json
{
  "permission": { "*": "allow" },
  "model": "anthropic/claude-sonnet"
}
```

## 输出解析

OpenCode 输出 NDJSON（`--format json`）。解析器处理 `text`、`tool_use`、`step_finish`、`error` 事件。`step_finish` 事件的费用会累加，进程关闭时输出一个 `done` 事件。
