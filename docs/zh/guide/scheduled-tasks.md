# 定时任务

GolemBot 支持按计划自动执行任务 — 运行 prompt 并将结果推送到 IM 通道。让你的助手成为主动工作的团队成员：每日站会汇总、依赖审计、测试健康报告等。

## 快速示例

```yaml
# golem.yaml
tasks:
  - id: daily-standup
    name: daily-standup
    schedule: "0 9 * * 1-5"
    prompt: |
      汇总过去 24 小时的所有 git commit，
      按作者分组，标注 breaking changes。
    enabled: true
    target:
      channel: feishu
      chatId: "oc_xxxxx"
```

每个工作日早上 9 点，Agent 自动执行 prompt 并把结果发到飞书群。

## 工作原理

```
golem.yaml (tasks)
      |
      v
golembot gateway
      |-- Scheduler 解析 cron 表达式，设置定时器
      |
      v
[定时器触发] --> Agent 执行 prompt
      |-- 结果通过 adapter.send() 推送到 IM
      |-- 执行记录写入 .golem/tasks/history/
```

- 每个任务有独立的 session（`task:{id}`），Agent 在多次执行间保持上下文。
- 任务仅在 **gateway 模式**下运行（`golembot gateway`），`golembot run` 和 `golembot serve` 不会启动调度器。
- 调度器使用 `setTimeout` 链式调度（非 `setInterval`），长时间运行的任务不会重叠。

## 配置

在 `golem.yaml` 的 `tasks` 数组中添加任务：

```yaml
tasks:
  - id: dependency-check
    name: dependency-check
    schedule: "weekly mon 10:00"
    prompt: 检查 package.json 中过时或有安全漏洞的依赖。
    target:
      channel: slack
      chatId: "C0123456789"

  - id: test-health
    name: test-health
    schedule: "every 6h"
    prompt: 运行 pnpm test，报告结果。如有失败，分析原因。
    target:
      channel: telegram
      chatId: "123456789"
    enabled: true
```

### 任务字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | `string` | 是 | 唯一标识符 |
| `name` | `string` | 是 | 可读名称 |
| `schedule` | `string` | 是 | 执行时间 — 见[调度格式](#调度格式) |
| `prompt` | `string` | 是 | 每次执行时发给 Agent 的指令 |
| `enabled` | `boolean` | 否 | 是否启用（默认 `true`） |
| `target` | `object` | 否 | 结果推送目标。省略则仅记录日志 |
| `target.channel` | `string` | -- | IM 通道类型（`feishu`、`dingtalk`、`wecom`、`slack`、`telegram`、`discord`） |
| `target.chatId` | `string` | -- | 目标会话或群组 ID |

### 调度格式

| 格式 | 示例 | 说明 |
|------|------|------|
| 标准 5 字段 cron | `0 9 * * 1-5` | 分、时、日、月、周 |
| 间隔简写 | `every 30m` | 每 30 分钟执行一次 |
| 每日简写 | `daily 09:00` | 每天指定时间执行 |
| 每周简写 | `weekly mon 09:00` | 每周指定日期和时间执行 |

**Cron 快速参考：**

```
 *  *  *  *  *
 |  |  |  |  |
 |  |  |  |  +-- 星期几 (0-7, 0 和 7 = 周日)
 |  |  |  +----- 月 (1-12)
 |  |  +-------- 日 (1-31)
 |  +----------- 时 (0-23)
 +-------------- 分 (0-59)
```

## 管理任务

### CLI（REPL 或 IM 中使用）

| 命令 | 说明 |
|------|------|
| `/cron list` | 列出所有任务及状态 |
| `/cron run <id>` | 立即触发指定任务 |
| `/cron enable <id>` | 启用任务 |
| `/cron disable <id>` | 禁用任务 |
| `/cron del <id>` | 删除任务 |
| `/cron history <id>` | 查看执行历史 |

这些命令在 REPL、IM 通道和 HTTP API 中均可使用。

### HTTP API

通过 `POST /chat` 发送 `/cron` 命令：

```bash
# 列出任务
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"/cron list"}'

# 立即触发
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"/cron run daily-standup"}'

# 查看历史
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"/cron history daily-standup"}'
```

### Dashboard

Gateway Dashboard（`http://localhost:3000/`）包含**定时任务**面板，显示任务名称、调度时间、状态和上次执行时间。支持在面板中手动触发任务。

## 通道支持

任务通过 `adapter.send()` 推送结果。全部 6 个内置通道均支持主动发送：

| 通道 | 主动发送 | 说明 |
|------|:-------:|------|
| 飞书 | 支持 | 使用 `im.v1.message.create` |
| Slack | 支持 | 使用 `chat.postMessage` |
| Telegram | 支持 | 使用 `sendMessage` |
| Discord | 支持 | 使用 `channel.send()` |
| 企微 | 支持 | 使用 `@wecom/aibot-node-sdk` 发送 API |
| 钉钉 | 支持 | 使用 `interactiveCardCreateAndDeliver` |

如果不指定 `target`，任务仍会执行，结果仅记录日志 — 适用于修改文件或运行测试等不需要通知的场景。

## 使用场景

### 每日站会汇总

```yaml
- id: standup
  name: standup
  schedule: "0 9 * * 1-5"
  prompt: |
    汇总过去 24 小时的所有 git commit，
    按作者分组，标注 breaking changes 和大型 PR。
  target:
    channel: slack
    chatId: "C-engineering"
```

### 依赖审计

```yaml
- id: deps
  name: dependency-audit
  schedule: "weekly mon 10:00"
  prompt: |
    检查是否有过时或存在安全漏洞的 npm 依赖，
    列出每个依赖的当前版本、最新版本和严重程度。
  target:
    channel: feishu
    chatId: "oc_security_team"
```

### 测试健康监控

```yaml
- id: tests
  name: test-health
  schedule: "every 6h"
  prompt: |
    运行测试套件。如果全部通过，回复一行摘要。
    如有失败，分析失败原因并建议修复方案。
  target:
    channel: telegram
    chatId: "123456789"
```

### 静默后台任务（不推送 IM）

```yaml
- id: cleanup
  name: cleanup-temp
  schedule: "daily 03:00"
  prompt: 删除 /tmp/workspace 中超过 7 天的所有文件。
  # 不设置 target — 静默执行，结果仅记录日志
```
