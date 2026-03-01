# 引导向导

`golembot onboard` 命令提供 7 步交互式向导，从零开始设置新助手。

## 用法

```bash
mkdir my-bot && cd my-bot
golembot onboard
```

或使用 `--template` 跳过模板选择：

```bash
golembot onboard --template customer-support
```

## 7 个步骤

### 第 1 步：选择引擎

选择 Coding Agent 后端：

- **cursor** — Cursor 的 `agent` CLI
- **claude-code** — Anthropic 的 `claude` CLI
- **opencode** — OpenCode CLI（多 Provider 支持）

### 第 2 步：命名助手

给助手一个描述性名称（如 `sales-analyst`、`team-helper`）。

### 第 3 步：选择 IM 通道

多选要接入的 IM 平台（可选）：

- 飞书
- 钉钉
- 企业微信

### 第 4–5 步：配置通道凭据

为每个选中的通道填写所需凭据：

- **飞书**：App ID + App Secret
- **钉钉**：Client ID + Client Secret
- **企业微信**：Corp ID + Agent ID + Secret + Token + Encoding AES Key

所有凭据存储在 `.env` 中，`golem.yaml` 使用 `${ENV_VAR}` 引用。

### 第 6 步：选择场景模板

从 6 个预置模板中选择：

| 模板 | 说明 |
|------|------|
| `customer-support` | 基于 FAQ 的客服支持，含升级追踪 |
| `data-analyst` | 数据分析，生成报告和计算 |
| `code-reviewer` | 5 维度代码审查，严重级别分层 |
| `ops-assistant` | 内容运营、排期管理、竞品追踪 |
| `meeting-notes` | 结构化会议纪要，行动项跟踪 |
| `research` | 结构化研究报告，来源管理 |

### 第 7 步：生成并启动

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
