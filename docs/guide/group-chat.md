# Group Chat

GolemBot can participate in group chats across all IM channels. Configure how the bot responds, handles @mentions, and maintains group memory.

## Response Policies

Control when the bot speaks in group chats via `groupChat.groupPolicy` in `golem.yaml`:

```yaml
groupChat:
  groupPolicy: smart     # mention-only (default) | smart | always
  historyLimit: 30       # recent messages injected as context (default: 20)
  maxTurns: 5            # max consecutive bot replies (default: 10)
```

| Policy | Agent called | When bot replies | Use case |
|--------|-------------|-----------------|---------|
| `mention-only` | Only on @mention | Only when @mentioned | Low noise, lowest cost |
| `smart` | Every message | Agent decides (outputs `[PASS]` to stay silent) | Bot observes all and builds memory continuously |
| `always` | Every message | Every message | High-interaction small groups |

### Smart mode

In `smart` mode the agent runs on **every** group message — even when it stays silent by outputting `[PASS]`. This means:

- The agent reads and understands all messages in real time
- Group memory is updated continuously (see [Group Memory](#group-memory) below)
- The agent has full conversation context when it does decide to reply
- When the bot is @mentioned in smart mode, the message is always processed (never skipped)

In `mention-only` mode, the agent only runs when @mentioned. Memory and context are only updated at those moments.

### Configuration reference

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `groupPolicy` | `string` | `mention-only` | Response policy |
| `historyLimit` | `number` | `20` | Recent messages injected as context |
| `maxTurns` | `number` | `10` | Max consecutive bot replies per group (safety valve) |

## Mention Handling

### Incoming @mentions

GolemBot strips `@` mentions from incoming messages before passing them to the agent. This handles:

- XML-style: `<at user_id="xxx">BotName</at>` (Feishu)
- Plain text: `@BotName`

Mention detection is word-boundary-aware — `@mybot` will not trigger on `@mybotplus`.

### Outgoing @mentions

When the AI reply contains `@name` patterns matching known group members, the gateway resolves them into native platform mentions. This requires the adapter to implement the optional `getGroupMembers()` method.

| Channel | Outgoing @mention | How it works |
|---------|:-:|------|
| **Feishu** | ✅ | Auto-discovers group members via API, converts to native `<at>` tags in card v2 messages. Requires `im:chat:readonly` permission. |
| **Slack** | ✅ | Fetches channel members via `conversations.members`, converts `@Name` to native `<@USER_ID>` mentions. |
| **Discord** | ✅ | Fetches guild members, converts `@Name` to native `<@USER_ID>` mentions. Requires the **Server Members Intent** (privileged) enabled in Discord Developer Portal. |
| DingTalk | ❌ | `@name` sent as plain text |
| WeCom | ❌ | `@name` sent as plain text |
| Telegram | ❌ | `@name` sent as plain text |

## Quote Reply

The bot replies as a **quote reply** (referencing the original message) instead of posting a standalone message. This makes conversation threads clearer in busy group chats.

| Channel | Quote Reply | Mechanism |
|---------|:-:|-----------|
| **Feishu** | ✅ | `im.v1.message.reply` (native quote) |
| **Telegram** | ✅ | `reply_to_message_id` parameter |
| **Slack** | ✅ | Thread reply via `thread_ts` |
| **Discord** | ✅ | Native `message.reply()` |
| **DingTalk** | ❌ | Webhook mode doesn't support quote reply |
| **WeCom** | ❌ | API doesn't support quote reply |

No configuration needed — quote reply is enabled automatically for supported channels.

## Group Memory

The agent maintains per-group memory files at:

```
memory/groups/<group-key>.md
```

The group key is derived from the channel type and chat ID (e.g., `slack-C123`, `telegram--100456`). GolemBot creates the `memory/groups/` directory automatically.

### File structure

```markdown
# Group: slack-C123

## Members
- Alice: frontend lead
- Bob: backend engineer

## Project Context
- Building a dashboard for monitoring API latency
- Using React + Go stack

## Decisions
- [2026-03-01] Chose Prometheus over Datadog for cost reasons
- [2026-03-03] Sprint deadline moved to March 15
```

### How policies affect memory

| Policy | Agent runs on | Memory updates |
|--------|--------------|----------------|
| `smart` | Every message (even when staying silent) | Continuous — agent observes all messages and updates memory in real time |
| `mention-only` | Only when @mentioned | Intermittent — memory only updates when the bot is invoked |
| `always` | Every message | Continuous |

## Multi-Bot Collaboration

When multiple GolemBot instances run on the same machine (each with its own `golem.yaml` and gateway port), they automatically discover each other through the **fleet** mechanism and coordinate in shared group chats.

### How it works

1. Each gateway registers itself in `~/.golembot/fleet/` at startup
2. The gateway periodically refreshes its peer list (every 60 seconds)
3. In group chats, the prompt includes a `[Peers: BotName (role)]` header showing all peer bots
4. Each bot's messages in group history are labeled `[bot:BotName]` for clear attribution

### Setup

```bash
# Bot A: product analyst
golembot init -n analyst-bot -e claude-code -r "product analyst"

# Bot B: user researcher (in a different directory)
golembot init -n research-bot -e claude-code -r "user researcher"
```

Start both gateways — they discover each other automatically. No additional configuration needed.

### Coordination by policy

| Policy | Multi-bot behavior |
|--------|---|
| `mention-only` | Each bot responds only when @mentioned. Lighter guidance helps bots defer out-of-domain questions to peers. |
| `smart` | Full `[PASS]` coordination — bots self-select whether to respond based on domain expertise and peer roles. Most effective for multi-bot groups. |
| `always` | All bots respond to every message. Lighter guidance for peer awareness, but no suppression. |

### Cross-bot delegation

Bots can call each other's HTTP API for explicit delegation:

```
POST http://127.0.0.1:<peer-port>/chat
{"message": "Analyze the user research data", "sessionKey": "delegation-123"}
```

The `multi-bot` built-in skill teaches the agent when and how to use this capability.

## Session Routing

**DM messages** use a per-user key: `${channelType}:${chatId}:${senderId}` — each user gets their own independent conversation.

**Group messages** use a shared key: `${channelType}:${chatId}` — all users in the same group share a single session, so the agent has full group context.
