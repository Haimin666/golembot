# Codex 引擎

Codex 引擎调用 OpenAI 的 `codex` CLI（`@openai/codex`），使用 OpenAI 模型自主完成任务。

## 前置条件

- 安装 Codex：`npm install -g @openai/codex`
- 认证（二选一）：
  - **ChatGPT OAuth** — `codex login`（适用于 ChatGPT Plus/Pro/Team/Enterprise 订阅者）
  - **API Key** — 设置 `OPENAI_API_KEY` 环境变量

## 配置

```yaml
# golem.yaml
name: my-bot
engine: codex
codex:
  mode: unrestricted  # 兼容别名；更细粒度的配置见下文
  search: true
# model: o4-mini   # 可选；使用 ChatGPT OAuth 时请省略
```

## 认证

Codex 支持两种认证方式：

### ChatGPT OAuth（浏览器登录）

适用于 ChatGPT Plus / Pro / Team / Enterprise 订阅者：

```bash
codex login    # 打开浏览器；凭据存储在 ~/.codex/auth.json
```

GolemBot 会自动使用存储的凭据，无需额外配置。

> **模型兼容性：** `codex-mini-latest` 仅在 API Key 模式下可用。使用 ChatGPT OAuth 时，请在 `golem.yaml` 中不设置 `model`，让 Codex 根据你的订阅方案自动选择合适的模型。

### API Key

适用于 CI/CD、脚本或程序化访问：

```bash
export CODEX_API_KEY=sk-...          # Codex CLI 官方 CI 文档指定的主要环境变量
# OPENAI_API_KEY 同样被接受，兼容旧版本

# 或预先使用 key 登录（存储在 ~/.codex/auth.json）：
printenv CODEX_API_KEY | codex login --with-api-key
```

通过 `createAssistant()` 或 `golem.yaml` 传入：

```typescript
const bot = createAssistant({ dir: './my-bot', apiKey: process.env.CODEX_API_KEY })
```

## 选择模型

**查看可用模型：**

```bash
codex models
```

**常用模型（API Key 模式）：**

| 模型 | 说明 |
|------|------|
| `5.3-codex` | 最新全尺寸 Codex 模型（2026 年 2 月起对 API 用户可见） |
| `codex-mini-latest` | 快速、低成本编程模型（基于 o4-mini） |
| `codex-1` | 基于 o3 的初始版本模型 |

**运行时覆盖** — 通过 `createAssistant()` 传入 `model`：

```typescript
const bot = createAssistant({ dir: './my-bot', model: 'o4-mini' })
```

## 运行控制

GolemBot 同时支持 `mode` 简写和更细粒度的 Codex 执行配置：

```yaml
engine: codex
codex:
  mode: unrestricted     # 可选简写：unrestricted | safe
  sandbox: workspace-write
  approval: on-request
  search: false
  addDirs:
    - ../shared-assets
```

简写模式：

| 模式 | CLI 参数 | 行为 |
|------|---------|------|
| `unrestricted` | `--dangerously-bypass-approvals-and-sandbox` | 无沙箱、无审批提示。适合运行在外部已隔离的环境中 |
| `safe` | `--full-auto` | 自动执行，但保留 Codex 的 `workspace-write` 沙箱 |

细粒度字段：

| 字段 | CLI 参数 | 说明 |
|------|---------|------|
| `sandbox` | `--sandbox <mode>` | `read-only`、`workspace-write` 或 `danger-full-access` |
| `approval` | `--ask-for-approval <policy>` | `untrusted`、`on-request` 或 `never`（作为 `exec` 前的顶层 Codex CLI 参数传递） |
| `search` | `--search` | 开启 Codex 的实时网页搜索工具（在 `exec` 前传递） |
| `addDirs` | `--add-dir <path>` | 为 workspace 增加额外可写目录 |

优先级：

- 只要设置了 `codex.sandbox` 或 `codex.approval`，GolemBot 就会显式传递 `--sandbox` / `--ask-for-approval`，不再使用 `mode` 简写。
- 如果只设置了其中一个，另一个默认补成 `workspace-write` / `on-request`。
- 两者都没设置时，才回退到 `mode`，而 `mode` 默认是 `unrestricted`。
- `approval` 和 `search` 会作为 `exec` 前的顶层 Codex CLI 参数传递；`sandbox`、`addDirs`、`image` 仍然挂在 `exec` 子命令上。

## 工作原理

### CLI 调用

GolemBot 以无头模式调用 Codex CLI：

```bash
# 新会话
codex exec --json --dangerously-bypass-approvals-and-sandbox --skip-git-repo-check "<prompt>"

# 恢复会话
codex exec resume --json --dangerously-bypass-approvals-and-sandbox --skip-git-repo-check <thread_id> "<prompt>"
```

使用的参数：

| 参数 | 用途 |
|------|------|
| `--json` | NDJSON 输出，流式解析所必需 |
| `--dangerously-bypass-approvals-and-sandbox` | 默认 `unrestricted` 模式：禁用提示并关闭沙箱 |
| `--full-auto` | `safe` 模式：禁用提示，但保留 Codex 沙箱 |
| `--sandbox <mode>` / `--ask-for-approval <policy>` | 配置 `codex.sandbox` / `codex.approval` 时使用的细粒度执行控制（`--ask-for-approval` 会放在 `exec` 前） |
| `--search` | 开启实时网页搜索（会放在 `exec` 前） |
| `--image <path>` | 为 prompt 附加输入图片 |
| `--add-dir <path>` | 增加额外可写目录 |
| `--skip-git-repo-check` | 允许在 Git 仓库外运行（临时目录、CI 工作区） |
| `--model <name>` | 覆盖模型（仅 API Key 模式） |

### 图片与搜索

当用户通过 GolemBot 发送图片附件时，Codex 引擎现在会用 `--image <path>` 转发给 Codex。如果配置了 `codex.search: true`，GolemBot 也会传递 `--search`，让 Codex 在这一轮里使用实时网页搜索。

### 技能注入

GolemBot 通过两种机制向 Codex 注入技能：

1. **`.agents/skills/` 符号链接** — 每个技能目录被 symlink 到 `.agents/skills/<name>`，匹配 Codex 原生的技能发现机制（progressive disclosure）
2. **`AGENTS.md`** — 自动生成在 workspace 根目录，包含技能描述和项目指令

```
my-bot/
├── AGENTS.md          # 自动生成，包含所有技能描述
├── .agents/
│   └── skills/
│       ├── general → ../../skills/general     # 符号链接
│       └── im-adapter → ../../skills/im-adapter
└── skills/
    ├── general/
    └── im-adapter/
```

### 输出解析

Codex 以 NDJSON 格式（`--json`）输出。解析器处理以下事件：

| 事件 | 处理方式 |
|------|---------|
| `thread.started` | 捕获 `thread_id` 用于会话恢复（不转发给消费者） |
| `item.completed`（`agent_message`）| 触发 `text` 事件 |
| `item.completed`（`command_execution`）| 触发 `tool_call` + `tool_result` 事件 |
| `turn.completed` | 触发携带 `sessionId = thread_id` 的 `done` 事件 |
| `turn.failed` | 触发 `error` 事件 |
| 顶层 `error` | WebSocket 重连通知被静默过滤；其他错误触发 `warning` 事件 |

### 会话恢复

`thread.started` 中的 `thread_id` 将作为 `sessionId`。下次对话时 GolemBot 调用：

```bash
codex exec resume --json --dangerously-bypass-approvals-and-sandbox --skip-git-repo-check <thread_id> "<prompt>"
```

`resume` 子命令继承所有参数并恢复既有的会话上下文。

## 注意事项

- Codex Cloud 任务仅在 ChatGPT OAuth 模式下可用，API Key 模式不支持
- 与其他引擎不同，Codex 的 `done` 事件不包含费用/Token 统计
- 技能通过 `.agents/skills/` 符号链接（Codex 原生发现）和 workspace 根目录的 `AGENTS.md` 注入
