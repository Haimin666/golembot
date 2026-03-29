# HTTP API

GolemBot 内置 HTTP 服务器，支持 SSE 流式传输，可通过 `golembot serve` 或 `createGolemServer()` 使用。

## 端点

### `POST /chat`

发送消息并接收 Server-Sent Events (SSE) 流。

**请求头：**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**请求体：**
```json
{
  "message": "分析销售数据",
  "sessionKey": "user-123",
  "images": [
    {
      "mimeType": "image/png",
      "data": "<base64 编码的图片数据>",
      "fileName": "screenshot.png"
    }
  ]
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `message` | `string` | 是* | 用户消息（*当提供 `images` 时可省略） |
| `sessionKey` | `string` | 否 | 会话标识（默认：`"default"`） |
| `images` | `array` | 否 | base64 编码的图片附件数组 |
| `images[].mimeType` | `string` | 否 | MIME 类型（默认：`"image/png"`） |
| `images[].data` | `string` | 是 | base64 编码的图片数据 |
| `images[].fileName` | `string` | 否 | 原始文件名 |

当提供 `images` 但没有 `message` 时，消息默认为 `"(image)"`。图片保存到 `.golem/images/`，通过路径引用注入 prompt，回复后自动清理。

**响应：** `text/event-stream`

```
data: {"type":"text","content":"让我看看"}

data: {"type":"tool_call","name":"readFile","args":"{\"path\":\"sales.csv\"}"}

data: {"type":"done","sessionId":"abc-123","durationMs":8500}

```

**斜杠命令：** 当消息以 `/` 开头时，将作为斜杠命令处理并返回 JSON 响应（非 SSE）：

```bash
curl -X POST http://localhost:3000/chat \
  -H "Authorization: Bearer my-secret" \
  -H "Content-Type: application/json" \
  -d '{"message": "/model list"}'
```

```json
{
  "type": "command",
  "engine": "claude-code",
  "models": ["claude-opus-4-6", "claude-sonnet-4-6", "claude-haiku-4-5-20251001"],
  "text": "Available models for claude-code (3):\n  claude-opus-4-6\n  ..."
}
```

可用斜杠命令：`/help`、`/status`、`/engine [name]`、`/model [list|name]`、`/skill`、`/cron`、`/reset`。

**定时任务管理：** `/cron` 命令同样可以通过 `POST /chat` 使用：

```bash
# 列出所有定时任务
curl -X POST http://localhost:3000/chat \
  -H "Authorization: Bearer my-secret" \
  -H "Content-Type: application/json" \
  -d '{"message": "/cron list"}'

# 立即触发指定任务
curl -X POST http://localhost:3000/chat \
  -H "Authorization: Bearer my-secret" \
  -H "Content-Type: application/json" \
  -d '{"message": "/cron run daily-standup"}'
```

::: warning SSE 中的错误事件
`/chat` 端点始终返回 `200 OK` — 错误通过流内的事件传递：

```
data: {"type":"error","message":"Server busy: too many concurrent requests (limit: 10). Try again later."}
data: {"type":"error","message":"Too many pending requests for this session (limit: 3). Try again later."}
data: {"type":"error","message":"Agent invocation timed out"}
```

请在 SSE 处理器中始终检查 `type === "error"`。
:::

### `POST /reset`

清除会话。请求体：`{ "sessionKey": "user-123" }`。响应：`{ "ok": true }`。

### `GET /health`

健康检查（无需认证）。响应：`{ "status": "ok", "timestamp": "..." }`。

### `GET /`（Dashboard）

在 gateway 模式（`golembot gateway`）下，根路径提供 HTML Dashboard，包含：
- Bot 状态、引擎、模型和运行时间
- **配置面板** — 一览所有 `golem.yaml` 设置（引擎、模型、`codex.mode`、超时、网关、供应商、群聊、流式、权限、MCP 服务器、系统提示词、消息队列、升级）
- **Fleet 节点** — 多 Bot 部署时的实例互相感知
- 通道连接状态（已连接 / 失败 / 未配置）
- 实时消息统计和费用追踪
- 通过 SSE 的实时活动流
- 技能清单
- 升级面板（卡片式设计）
- 快速测试面板（可直接在浏览器中发送消息）
- HTTP API 和 embed SDK 代码示例（带复制按钮）

无需认证（首页）。

### `GET /api/status`

返回当前 bot 状态和指标的 JSON。需要认证。

```json
{
  "name": "my-bot",
  "engine": "claude-code",
  "version": "0.13.1",
  "uptime": 3600000,
  "channels": [{ "type": "telegram", "status": "connected" }],
  "metrics": { "totalMessages": 42, "totalCostUsd": 1.23, "avgDurationMs": 2000 },
  "recentMessages": []
}
```

### `POST /api/send`

向 IM 通道（群聊或私聊）主动发送消息。需要认证。

**Body:**
```json
{
  "channel": "feishu",
  "chatId": "oc_xxxx",
  "text": "会议改到下午 3 点"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `channel` | `string` | 是 | 通道名：`feishu`、`dingtalk`、`wecom`、`slack`、`telegram`、`discord` |
| `chatId` | `string` | 是 | 目标平台上的群/用户 ID |
| `text` | `string` | 是 | 消息内容（支持 Markdown） |

**响应：**
```json
{ "ok": true }
```

**错误响应：**

| 状态码 | 原因 |
|--------|------|
| `400` | 缺少必填字段 |
| `404` | 通道未找到（响应中包含可用通道列表） |
| `501` | 该通道适配器不支持主动发送 |
| `503` | 无可用通道适配器 |

### `PATCH /api/config`

远程更新 `golem.yaml` 配置。需要认证。

**请求体：** 部分 `GolemConfig` JSON — 只传需要修改的字段。

```json
{
  "timeout": 180,
  "codex": { "mode": "safe" },
  "groupChat": { "groupPolicy": "smart" }
}
```

**响应：**
```json
{
  "ok": true,
  "config": { /* 合并后的完整 GolemConfig */ },
  "needsRestart": false
}
```

`needsRestart` 标识修改是否需要重启 Gateway 才能生效：

| 热更新（立即生效） | 需要重启 |
|---|---|
| `timeout`、`maxConcurrent`、`sessionTtlDays`、`groupChat`、`streaming`、`persona`、`permissions`、`systemPrompt` | `engine`、`model`、`codex`、`channels`、`gateway`、`mcp`、`provider.baseUrl`、`provider.apiKey`、`provider.fallback` |

**示例：**

```bash
curl -X PATCH http://localhost:3000/api/config \
  -H "Authorization: Bearer my-secret" \
  -H "Content-Type: application/json" \
  -d '{"timeout": 180, "streaming": {"mode": "streaming"}}'
```

### `GET /api/channels`

列出可用 IM 通道及其是否支持主动发送。需要认证。

**响应：**
```json
{
  "channels": [
    { "name": "feishu", "canSend": true },
    { "name": "slack", "canSend": true },
    { "name": "dingtalk", "canSend": false }
  ]
}
```

### `GET /api/events`

通过 Server-Sent Events 的实时活动流。Gateway 处理的每条消息都会广播为 SSE 事件。需要认证。

启用认证时，通过 query 参数传递 token（`EventSource` 无法设置 headers）：

```
GET /api/events?token=my-secret
```

## 认证

除 `/health` 外的所有端点需要 Bearer Token：

```
Authorization: Bearer <token>
```

Token 通过 `--token` CLI 参数、`GOLEM_TOKEN` 环境变量或 `golem.yaml` 中的 `gateway.token` 配置。

## 编程使用

```typescript
import { createAssistant, createGolemServer, startServer } from 'golembot';

const assistant = createAssistant({ dir: './my-bot' });

// 方式 1：获取 server 实例
const server = createGolemServer(assistant, { port: 3000, token: 'my-secret' });

// 方式 2：直接启动
await startServer(assistant, { port: 3000, token: 'my-secret' });
```
