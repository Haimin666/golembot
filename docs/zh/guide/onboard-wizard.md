# 引导向导

`golembot onboard` 命令提供 8 步交互式向导，从零开始设置新助手。

## 用法

```bash
mkdir my-bot && cd my-bot
golembot onboard
```

或使用 `--template` 跳过模板选择：

```bash
golembot onboard --template customer-support
```

## 8 个步骤

### 第 1 步：选择引擎

选择 Coding Agent 后端：

- **cursor** — Cursor 的 `agent` CLI
- **claude-code** — Anthropic 的 `claude` CLI
- **opencode** — OpenCode CLI（多 Provider 支持）
- **codex** — OpenAI Codex CLI

### 第 2 步：引擎鉴权

向导会检测所选引擎是否已完成鉴权（环境变量或 CLI 登录）。如未鉴权，可选择：

- **输入 API Key** — 自动保存到 `.env`
- **确认已通过 CLI 登录** — 适用于支持浏览器 OAuth 的引擎（`claude auth login`、`codex login`、`agent login`）
- **跳过** — 之后再配置（向导会提示你）

| 引擎 | API Key | CLI 登录 |
|------|---------|----------|
| Cursor | `CURSOR_API_KEY` | `agent login` |
| Claude Code | `ANTHROPIC_API_KEY` | `claude auth login` |
| OpenCode | 取决于 Provider | — |
| Codex | `CODEX_API_KEY` | `codex login` |

### 第 3 步：命名助手

给助手一个描述性名称（如 `sales-analyst`、`team-helper`）。

### 第 4 步：选择 IM 通道

多选要接入的 IM 平台（可选）。全部 6 个平台均支持：

- **飞书（Lark）** — WebSocket 长连接，无需公网 IP
- **钉钉** — Stream 模式，无需公网 IP
- **企业微信** — WebSocket 模式，无需公网 IP
- **Slack** — Socket Mode，无需公网 IP
- **Telegram** — 轮询模式，无需公网 IP
- **Discord** — Gateway API，无需公网 IP

### 第 5–6 步：配置通道凭据

为每个选中的通道填写所需凭据：

- **飞书**：App ID + App Secret
- **钉钉**：Client ID + Client Secret
- **企业微信**：Corp ID + Agent ID + Secret + Token + Encoding AES Key
- **Slack**：Bot Token + App-Level Token
- **Telegram**：Bot Token
- **Discord**：Bot Token

所有凭据存储在 `.env` 中，`golem.yaml` 使用 `${ENV_VAR}` 引用。

### 第 7 步：选择场景模板

从 6 个预置模板中选择，或选择**不使用模板**：

| 模板 | 说明 |
|------|------|
| `customer-support` | 基于 FAQ 的客服支持，含升级追踪 |
| `data-analyst` | 数据分析，生成报告和计算 |
| `code-reviewer` | 5 维度代码审查，严重级别分层 |
| `ops-assistant` | 内容运营、排期管理、竞品追踪 |
| `meeting-notes` | 结构化会议纪要，行动项跟踪 |
| `research` | 结构化研究报告，来源管理 |
| *（不使用）* | 跳过 — 仅使用内置技能 |

模板是**可选的**。选择"不使用"会跳过模板安装，助手仍然拥有 `general` 和 `im-adapter` 两个内置技能，功能完整。

如果没有合适的模板，可以在这里跳过，之后自定义技能 — 在 `skills/` 下新建目录并放一个 `SKILL.md` 文件即可。详见[创建技能](/zh/skills/create-skill)。

### 第 8 步：生成并启动

向导生成：

- `golem.yaml` — 助手配置
- `.env` — 环境变量（凭据）
- `.env.example` — 用于共享的模板
- `.gitignore` — 排除 `.golem/` 和 `.env`
- `skills/` — 内置技能 + 模板技能
- `AGENTS.md` — 自动生成的 Agent 上下文

可选择立即启动 Gateway。

## 选项

| 选项 | 说明 |
|------|------|
| `-d, --dir <dir>` | 工作目录（默认：`.`） |
| `--template <name>` | 跳过模板选择步骤 |
