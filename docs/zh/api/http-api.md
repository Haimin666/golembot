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

### `POST /reset`

清除会话。请求体：`{ "sessionKey": "user-123" }`。响应：`{ "ok": true }`。

### `GET /health`

健康检查（无需认证）。响应：`{ "status": "ok", "timestamp": "..." }`。

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
