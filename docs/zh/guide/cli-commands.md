# CLI 命令

GolemBot 提供一组 CLI 命令用于管理和运行助手。

## `golembot init`

初始化新的助手目录。

```bash
golembot init [-e <engine>] [-n <name>]
```

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `-e, --engine <engine>` | 引擎类型 | `cursor` |
| `-n, --name <name>` | 助手名称 | 交互式提示 |

## `golembot run`

启动交互式 REPL 对话。

```bash
golembot run [-d <dir>] [--api-key <key>]
```

**REPL 斜杠命令：** `/help`、`/reset`、`/quit`、`/exit`

支持 `"""` 分隔符的多行输入。完成时显示耗时和费用（如可用）。

## `golembot serve`

启动 HTTP SSE 服务。

```bash
golembot serve [-d <dir>] [-p <port>] [-t <token>] [--host <host>] [--api-key <key>]
```

详见 [HTTP API](/zh/api/http-api)。

## `golembot gateway`

启动 IM + HTTP 统一网关服务。

```bash
golembot gateway [-d <dir>] [-p <port>] [-t <token>] [--host <host>] [--api-key <key>] [--verbose]
```

读取 `golem.yaml` 中的 `channels` 配置，启动对应的 IM 适配器和 HTTP 服务。

## `golembot onboard`

运行交互式设置向导。

```bash
golembot onboard [-d <dir>] [--template <name>]
```

详见[引导向导](/zh/guide/onboard-wizard)。

## `golembot status`

显示当前助手配置信息：名称、引擎、模型、已安装技能、已配置通道和 Gateway 设置。

```bash
golembot status [-d <dir>]
```

## `golembot skill`

管理助手目录中的技能。

```bash
golembot skill list [-d <dir>]          # 列出已安装技能
golembot skill add <source> [-d <dir>]  # 从路径添加技能
golembot skill remove <name> [-d <dir>] # 移除技能
```

## `golembot doctor`

运行前置条件检查：Node.js 版本、`golem.yaml`、引擎 CLI、API Key、技能目录。

```bash
golembot doctor [-d <dir>]
```

## 环境变量

| 变量 | 用于 | 说明 |
|------|------|------|
| `CURSOR_API_KEY` | Cursor 引擎 | Cursor API Key |
| `ANTHROPIC_API_KEY` | Claude Code 引擎 | Anthropic API Key |
| `OPENAI_API_KEY` | OpenCode 引擎 | OpenAI API Key |
| `GOLEM_TOKEN` | serve / gateway | HTTP Bearer 认证 Token |
| `GOLEM_PORT` | serve / gateway | HTTP 端口覆盖 |

CLI 启动时自动加载工作目录中的 `.env` 文件。
