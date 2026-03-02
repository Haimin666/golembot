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

Cursor 维护自己的模型列表，名称**不同于** Anthropic 或 OpenAI 的官方命名。

**查看可用模型名称：**

1. 打开 Cursor → Settings → Models — 界面中显示的标识符就是填入 `model` 的值。
2. 或查阅 [Cursor 模型文档](https://docs.cursor.com/settings/models)。

**常用值：**

| 模型 | 说明 |
|------|------|
| `claude-sonnet-4-5` | Anthropic Claude Sonnet（通过 Cursor） |
| `gpt-4o` | OpenAI GPT-4o |
| `o3-mini` | OpenAI o3-mini |
| `gemini-2.5-pro` | Google Gemini 2.5 Pro |

不填 `model` 时，Cursor 使用其 Settings 中配置的默认模型。

**运行时覆盖** — 通过 `createAssistant()` 传入：

```typescript
const bot = createAssistant({ dir: './my-bot', model: 'gpt-4o' })
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
