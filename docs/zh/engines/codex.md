# Codex 引擎

Codex 引擎调用 OpenAI 的 `codex` CLI（`@openai/codex`），使用 OpenAI 模型自主完成任务。

## 前置条件

- 安装 Codex：`npm install -g @openai/codex`
- 设置 `OPENAI_API_KEY` 环境变量

## 配置

```yaml
# golem.yaml
name: my-bot
engine: codex
model: codex-mini-latest   # 可选
```

## 选择模型

**查看可用模型：**

```bash
codex models
```

**常用模型：**

| 模型 | 说明 |
|------|------|
| `codex-mini-latest` | 快速、低成本编程模型（默认） |
| `o4-mini` | OpenAI o4-mini 推理模型 |

**运行时覆盖** — 通过 `createAssistant()` 传入 `model`：

```typescript
const bot = createAssistant({ dir: './my-bot', model: 'o4-mini' })
```

## 认证

```bash
# 本地开发
export OPENAI_API_KEY=sk-...

# 或使用 codex login
codex login --with-api-key sk-...
```

CI/CD 环境下，设置 `OPENAI_API_KEY` 环境变量，或通过 `createAssistant()` 的 `apiKey` 参数传入。

## 工作原理

### CLI 调用

```bash
codex exec --json --full-auto "<prompt>"
```

可选参数：
- `--model <name>` — 指定模型
- `resume <thread_id>` — 恢复历史会话

### 技能注入

Codex 通过 workspace 根目录的 `AGENTS.md` 发现技能。GolemBot 会从 `skills/` 目录自动生成该文件，无需额外配置。

```
my-bot/
├── AGENTS.md          # 自动生成，包含所有技能描述
└── skills/
    ├── general/
    └── im-adapter/
```

### 输出解析

Codex 以 NDJSON 格式（`--json`）输出。解析器处理以下事件：

- `thread.started` — 捕获 `thread_id` 用于会话恢复（不向消费者 yield）
- `item.completed`（`agent_message`）— 文本内容
- `item.completed`（`command_execution`）— 工具调用 + 工具结果
- `turn.completed` — 触发携带 `sessionId` 的 `done` 事件
- `turn.failed` — 触发 `error` 事件
- 顶层 `error` — 触发 `error` 事件

### 会话恢复

`thread.started` 中的 `thread_id` 将作为 `sessionId`。下次对话时：

```bash
codex exec --json --full-auto resume <thread_id> "<prompt>"
```

## 注意事项

- `--full-auto` 禁用交互式权限提示，无头操作必须使用此参数
- 技能通过 workspace 根目录的 `AGENTS.md` 发现（与 Claude Code 使用同一文件）
- 与其他引擎不同，Codex 的 `done` 事件不包含费用/Token 统计
