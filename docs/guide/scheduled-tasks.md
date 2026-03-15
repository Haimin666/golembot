# Scheduled Tasks

GolemBot can run tasks on a schedule — executing prompts automatically and pushing results to IM channels. This turns your assistant into a proactive team member: daily standups, dependency audits, test health reports, and more.

## Quick Example

```yaml
# golem.yaml
tasks:
  - id: daily-standup
    name: daily-standup
    schedule: "0 9 * * 1-5"
    prompt: |
      Summarize all git commits in the last 24 hours,
      grouped by author. Flag any breaking changes.
    enabled: true
    target:
      channel: feishu
      chatId: "oc_xxxxx"
```

Every weekday at 9 AM, the agent runs the prompt and sends the result to your Feishu group.

## How It Works

```
golem.yaml (tasks)
      |
      v
golembot gateway
      |-- Scheduler parses cron expressions, sets timers
      |
      v
[Timer fires] --> agent runs the prompt
      |-- Result pushed to IM via adapter.send()
      |-- Execution logged to .golem/tasks/history/
```

- Each task gets its own session (`task:{id}`), so the agent retains context across runs.
- Tasks only run in **gateway mode** (`golembot gateway`). They do not run in `golembot run` or `golembot serve`.
- The scheduler uses `setTimeout` chains (not `setInterval`), so long-running tasks never overlap.

## Configuration

Add tasks to the `tasks` array in `golem.yaml`:

```yaml
tasks:
  - id: dependency-check
    name: dependency-check
    schedule: "weekly mon 10:00"
    prompt: Check package.json for outdated or vulnerable dependencies.
    target:
      channel: slack
      chatId: "C0123456789"

  - id: test-health
    name: test-health
    schedule: "every 6h"
    prompt: Run pnpm test and report results. If any fail, analyze the cause.
    target:
      channel: telegram
      chatId: "123456789"
    enabled: true
```

### Task Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | Yes | Unique identifier |
| `name` | `string` | Yes | Human-readable name |
| `schedule` | `string` | Yes | When to run — see [schedule formats](#schedule-formats) |
| `prompt` | `string` | Yes | The prompt sent to the engine on each run |
| `enabled` | `boolean` | No | Whether the task is active (default: `true`) |
| `target` | `object` | No | Where to deliver the result. If omitted, result is logged only |
| `target.channel` | `string` | -- | IM channel type (`feishu`, `dingtalk`, `wecom`, `slack`, `telegram`, `discord`) |
| `target.chatId` | `string` | -- | Chat or group ID to send the result to |

### Schedule Formats

| Format | Example | Description |
|--------|---------|-------------|
| Standard 5-field cron | `0 9 * * 1-5` | Minute, hour, day-of-month, month, day-of-week |
| Interval shorthand | `every 30m` | Run every 30 minutes |
| Daily shorthand | `daily 09:00` | Run once per day at the given time |
| Weekly shorthand | `weekly mon 09:00` | Run once per week on the given day and time |

**Cron quick reference:**

```
 *  *  *  *  *
 |  |  |  |  |
 |  |  |  |  +-- day of week (0-7, 0 and 7 = Sunday)
 |  |  |  +----- month (1-12)
 |  |  +-------- day of month (1-31)
 |  +----------- hour (0-23)
 +-------------- minute (0-59)
```

## Managing Tasks

### CLI (`golembot run` REPL or IM)

| Command | Description |
|---------|-------------|
| `/cron list` | List all tasks with status |
| `/cron run <id>` | Trigger a task immediately |
| `/cron enable <id>` | Enable a task |
| `/cron disable <id>` | Disable a task |
| `/cron del <id>` | Delete a task |
| `/cron history <id>` | View execution history |

These commands work in the REPL, in any IM channel, and via the HTTP API.

### HTTP API

Send `/cron` commands via `POST /chat`:

```bash
# List tasks
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"/cron list"}'

# Trigger a task now
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"/cron run daily-standup"}'

# View history
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"/cron history daily-standup"}'
```

### Dashboard

The gateway Dashboard (`http://localhost:3000/`) displays a **Scheduled Tasks** panel showing task names, schedules, status, and last run time. You can trigger tasks manually from the dashboard.

## Channel Support

Tasks deliver results via `adapter.send()`. All 6 built-in channels support proactive sending:

| Channel | Proactive Send | Notes |
|---------|:--------------:|-------|
| Feishu | Yes | Uses `im.v1.message.create` |
| Slack | Yes | Uses `chat.postMessage` |
| Telegram | Yes | Uses `sendMessage` |
| Discord | Yes | Uses `channel.send()` |
| WeCom | Yes | Uses `@wecom/aibot-node-sdk` send API |
| DingTalk | Yes | Uses `interactiveCardCreateAndDeliver` |

If no `target` is specified, the task still runs and the result is logged — useful for tasks that modify files or run tests without needing to notify anyone.

## Use Cases

### Daily Standup Summary

```yaml
- id: standup
  name: standup
  schedule: "0 9 * * 1-5"
  prompt: |
    Summarize all git commits from the last 24 hours.
    Group by author. Flag breaking changes or large PRs.
  target:
    channel: slack
    chatId: "C-engineering"
```

### Dependency Audit

```yaml
- id: deps
  name: dependency-audit
  schedule: "weekly mon 10:00"
  prompt: |
    Check for outdated or vulnerable npm dependencies.
    List each with current vs latest version and severity.
  target:
    channel: feishu
    chatId: "oc_security_team"
```

### Test Health Monitor

```yaml
- id: tests
  name: test-health
  schedule: "every 6h"
  prompt: |
    Run the test suite. If all pass, reply with a one-line summary.
    If any fail, analyze the failure and suggest a fix.
  target:
    channel: telegram
    chatId: "123456789"
```

### Silent Background Task (No IM)

```yaml
- id: cleanup
  name: cleanup-temp
  schedule: "daily 03:00"
  prompt: Delete all files in /tmp/workspace older than 7 days.
  # No target — runs silently, result logged only
```
