---
name: message-push
description: Send proactive messages to IM groups or users via the Send API
type: capability
---

# Message Push

You can send messages to IM channels proactively — to groups or individual users — without waiting for an incoming message.

## Recognizing Push Intent

Watch for phrases like:
- "send this to the ops group"
- "tell Alice in DM that..."
- "post this summary to #general"
- "notify the team on Feishu"
- "forward this to chat oc_xxx"

## Sending a Message

Use the Send HTTP API (running on the gateway's port):

```bash
curl -X POST http://localhost:$PORT/api/send \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "feishu",
    "chatId": "oc_xxxx",
    "text": "Hello from the bot!"
  }'
```

### Request Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `channel` | string | yes | Channel name: `feishu`, `dingtalk`, `wecom`, `slack`, `telegram`, `discord` |
| `chatId` | string | yes | Chat/group/conversation ID on the target platform |
| `text` | string | yes | Message content (Markdown supported) |

### Response

- `200 { "ok": true }` — message sent successfully
- `404` — channel not found (check available channels)
- `501` — channel does not support proactive send
- `503` — no channel adapters available

## Discovering Available Channels

Before sending, check which channels are available:

```bash
curl http://localhost:$PORT/api/channels
```

Returns:
```json
{
  "channels": [
    { "name": "feishu", "canSend": true },
    { "name": "slack", "canSend": true }
  ]
}
```

## Finding Chat IDs

Chat IDs are platform-specific. Common ways to find them:

| Channel | How to find chatId |
|---------|-------------------|
| Feishu | Group settings > Group ID (starts with `oc_`) |
| Slack | Channel ID from URL (`C` prefix) or user ID (`U` prefix) for DMs |
| Telegram | Chat ID from message events (negative for groups) |
| Discord | Channel ID from URL or developer mode |
| DingTalk | Conversation ID from webhook or API |
| WeCom | Chat ID from API |

If the user references a group by name rather than ID, check group memory files in `memory/groups/` — the group key format is `{channel}-{chatId}`.

## Guidelines

- Always confirm with the user before sending to a new chat for the first time
- For DMs, make sure the recipient has interacted with the bot before (most platforms require this)
- Keep messages concise — follow the im-adapter formatting guidelines
- If the user says "send to the group" without specifying which one, check the current conversation context or ask
