# Cursor 引擎

Cursor 引擎调用 Cursor 的 `agent` CLI 来处理对话。

## 前置条件

- 安装 `agent` CLI：`~/.local/bin/agent` 或在 PATH 中可用
- 设置 `CURSOR_API_KEY` 环境变量

## 配置

```yaml
name: my-bot
engine: cursor
model: claude-sonnet-4-5   # 可选，见下方说明
```

## 选择模型

Cursor 使用独立的模型标识符，与 Anthropic/OpenAI 官方命名不同。完整列表见 [cursor.com/docs/models](https://cursor.com/docs/models)。

**当前可用模型（2025）：**

| 模型标识符 | 来源 |
|-----------|------|
| `claude-4.6-sonnet` | Anthropic |
| `claude-4.6-opus` | Anthropic |
| `claude-4.5-sonnet` | Anthropic |
| `gpt-5` | OpenAI |
| `gpt-5-mini` | OpenAI |
| `gemini-3-pro` | Google |
| `gemini-2.5-flash` | Google |
| `composer-1.5` | Cursor |

不填 `model` 时，Cursor 使用 Settings 中配置的默认模型。

**运行时覆盖** — 通过 `createAssistant()` 传入：

```typescript
const bot = createAssistant({ dir: './my-bot', model: 'claude-4.6-sonnet' })
```

## 工作原理

### 技能注入

技能通过符号链接注入到 `.cursor/skills/`。旧的符号链接在每次调用前清理。

### 输出解析

Cursor 输出带 ANSI 转义码的 stream-json。GolemBot 会：
1. 剥离 ANSI 码
2. 解析 JSON 事件（`assistant`、`tool_call`、`result` 类型）
3. 应用**段累积去重** — Cursor 先发字符级增量再发总结；如果总结与累积文本一致则丢弃

### 会话恢复

使用 `--resume <sessionId>` 自动恢复会话。如果恢复失败（引擎侧过期），GolemBot 自动开始新会话。
