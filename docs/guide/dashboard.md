# Dashboard

GolemBot Gateway includes a built-in web dashboard for monitoring and managing your bot at a glance.

## Accessing the Dashboard

Start the gateway, then open the dashboard URL in your browser:

```bash
golembot gateway          # default: http://localhost:3000
golembot gateway -p 3010  # custom port: http://localhost:3010
```

The dashboard is served at the root path (`/`) of the gateway.

## Overview

The dashboard provides a single-page view of your bot's entire state:

| Panel | Description |
|-------|-------------|
| **Header** | Bot name, engine, model, online status, uptime, version |
| **Configuration** | All `golem.yaml` settings with inline editing |
| **IM Channels** | Connection status for each channel (Feishu, Slack, Telegram, etc.) |
| **Quick Test** | Send a message and see the response in real time |
| **Fleet Peers** | Other GolemBot instances discovered on this machine |
| **Skills** | All installed skills with descriptions |
| **Statistics** | Message count, total cost, average response time |
| **Escalation** | Recent escalation events (if escalation is enabled) |
| **Memory** | Memory files overview |
| **Live Activity** | Real-time message feed via SSE |

## Configuration Panel

The Configuration Panel displays **all** `golem.yaml` settings organized into 7 collapsible sections:

| Section | Fields |
|---------|--------|
| **Engine & Runtime** | engine, model, codex.mode, skipPermissions, timeout, maxConcurrent, maxQueuePerSession, sessionTtlDays |
| **Gateway** | host, port, auth token (masked) |
| **Provider** | baseUrl, apiKey (masked), model override, failover threshold, recovery cooldown, fallback |
| **Group Chat** | groupPolicy, historyLimit, maxTurns |
| **Streaming** | mode, showToolCalls |
| **Permissions** | allowedPaths, deniedPaths, allowedCommands, deniedCommands |
| **Advanced** | system prompt, MCP servers, inbox, history fetch, escalation |

### Inline Editing

Most configuration fields can be edited directly from the dashboard:

1. **Hover** over any editable value — a pencil button (✎) appears
2. **Click ✎** — the value transforms into an input field (text, number, dropdown, or boolean toggle depending on the field type)
3. **Modify** the value and click **Save**, or click **Cancel** to discard
4. The change is written to `golem.yaml` and takes effect immediately

**Sensitive fields** (API keys, auth tokens) are displayed as masked values (e.g., `sk-••••••ef`) and cannot be edited from the dashboard for security reasons.

### Hot Reload vs Restart

When you save a change, the dashboard checks whether the field requires a gateway restart:

| Hot-reloadable (immediate) | Restart required |
|---|---|
| timeout, maxConcurrent, sessionTtlDays, groupChat, streaming, persona, permissions, systemPrompt | engine, model, codex, channels, gateway, mcp, provider.baseUrl, provider.apiKey |

If a restart is needed, a yellow warning banner appears at the top of the page:

> ⚠ Configuration updated — restart the gateway for changes to take full effect.

## Fleet Peers

When running multiple GolemBot instances on the same machine, the **Fleet Peers** panel shows all discovered instances with their name, engine, model, and online status. Click "Dashboard" to jump to another instance's dashboard.

Fleet discovery uses GolemBot's instance registry (`~/.golem/instances/`) — no manual configuration needed.

## Quick Test

The Quick Test panel lets you send a message directly from the dashboard and see the streaming response in real time. This is useful for verifying your bot works without switching to an IM client or using `curl`.

If authentication is enabled, you'll need to enter the auth token first to unlock the test panel.

## Live Activity Feed

The Live Activity panel shows a real-time feed of all messages processed by the gateway, including:

- Timestamp, source channel, sender
- Message preview and response preview
- Response duration and cost

The feed updates automatically via Server-Sent Events (SSE) — no manual refresh needed.

## Programmatic Access

All dashboard data is also available via the [HTTP API](/api/http-api):

- `GET /api/dashboard` — full dashboard data as JSON
- `PATCH /api/config` — update configuration programmatically
- `GET /api/events` — SSE stream for real-time updates

See [HTTP API Reference](/api/http-api) for details.
