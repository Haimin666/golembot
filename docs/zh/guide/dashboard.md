# Dashboard 仪表盘

GolemBot Gateway 内置了 Web 仪表盘，可一站式监控和管理你的 Bot。

## 访问仪表盘

启动 Gateway 后，在浏览器中打开仪表盘地址：

```bash
golembot gateway          # 默认: http://localhost:3000
golembot gateway -p 3010  # 自定义端口: http://localhost:3010
```

仪表盘在 Gateway 的根路径（`/`）提供服务。

## 概览

仪表盘提供 Bot 完整状态的单页视图：

| 面板 | 说明 |
|------|------|
| **顶栏** | Bot 名称、引擎、模型、在线状态、运行时间、版本 |
| **配置面板** | 所有 `golem.yaml` 设置，支持内联编辑 |
| **IM 通道** | 各通道连接状态（飞书、Slack、Telegram 等） |
| **快速测试** | 直接发消息并实时查看回复 |
| **Fleet 节点** | 本机上发现的其他 GolemBot 实例 |
| **技能清单** | 已安装的所有技能及描述 |
| **统计** | 消息数、总花费、平均响应时间 |
| **升级事件** | 近期升级记录（如已启用升级功能） |
| **记忆** | 记忆文件概览 |
| **实时活动** | 通过 SSE 实时更新的消息流 |

## 配置面板

配置面板展示 `golem.yaml` 中的**全部**设置，分为 7 个可折叠分组：

| 分组 | 字段 |
|------|------|
| **引擎与运行时** | engine, model, codex.mode, skipPermissions, timeout, maxConcurrent, maxQueuePerSession, sessionTtlDays |
| **网关** | host, port, auth token（脱敏显示） |
| **Provider** | baseUrl, apiKey（脱敏显示）, model override, failover threshold, recovery cooldown, fallback |
| **群聊** | groupPolicy, historyLimit, maxTurns |
| **流式输出** | mode, showToolCalls |
| **权限** | allowedPaths, deniedPaths, allowedCommands, deniedCommands |
| **高级** | system prompt, MCP 服务器, 消息队列, 历史追回, 升级 |

### 内联编辑

大多数配置项都可以直接在仪表盘中编辑：

1. **悬停**在可编辑的值上 — 出现铅笔按钮（✎）
2. **点击 ✎** — 值变为输入框（文本框、数字框、下拉选择或布尔开关，根据字段类型自动匹配）
3. **修改**值后点击 **Save** 保存，或点击 **Cancel** 取消
4. 修改会写入 `golem.yaml` 并立即生效

**敏感字段**（API Key、Auth Token）以脱敏形式显示（如 `sk-••••••ef`），出于安全考虑不支持从仪表盘编辑。

### 热加载与重启

保存修改时，仪表盘会判断该字段是否需要重启 Gateway：

| 热加载（立即生效） | 需要重启 |
|---|---|
| timeout, maxConcurrent, sessionTtlDays, groupChat, streaming, persona, permissions, systemPrompt | engine, model, codex, channels, gateway, mcp, provider.baseUrl, provider.apiKey |

如需重启，页面顶部会显示黄色警告条：

> ⚠ Configuration updated — restart the gateway for changes to take full effect.

## Fleet 节点

在同一台机器上运行多个 GolemBot 实例时，**Fleet 节点**面板会显示所有发现的实例，包括名称、引擎、模型和在线状态。点击 "Dashboard" 可跳转到其他实例的仪表盘。

Fleet 发现基于 GolemBot 的实例注册表（`~/.golem/instances/`），无需额外配置。

## 快速测试

快速测试面板可以直接在仪表盘中发消息并实时看到流式回复，适合快速验证 Bot 是否正常工作，无需切换到 IM 客户端或使用 `curl`。

如果启用了认证，需要先输入 Auth Token 解锁测试面板。

## 实时活动流

实时活动面板显示 Gateway 处理的所有消息的实时流，包括：

- 时间戳、来源通道、发送者
- 消息预览和回复预览
- 响应耗时和花费

通过 Server-Sent Events (SSE) 自动更新，无需手动刷新。

## 程序化访问

仪表盘的所有数据也可通过 [HTTP API](/zh/api/http-api) 获取：

- `GET /api/dashboard` — 完整仪表盘数据（JSON 格式）
- `PATCH /api/config` — 远程更新配置
- `GET /api/events` — SSE 实时事件流

详见 [HTTP API 参考](/zh/api/http-api)。
