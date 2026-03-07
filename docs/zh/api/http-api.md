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
  "sessionKey": "user-123"
}
```

**响应：** `text/event-stream`

```
data: {"type":"text","content":"让我看看"}

data: {"type":"tool_call","name":"readFile","args":"{\"path\":\"sales.csv\"}"}

data: {"type":"done","sessionId":"abc-123","durationMs":8500}

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
- 通道连接状态（已连接 / 失败 / 未配置）
- 实时消息统计和费用追踪
- 通过 SSE 的实时活动流
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
