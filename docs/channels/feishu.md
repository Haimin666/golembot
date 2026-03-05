# Feishu (Lark)

Connect your GolemBot assistant to Feishu (Lark) using WebSocket long-connection mode. No public IP required.

## Prerequisites

```bash
pnpm add @larksuiteoapi/node-sdk
```

## Feishu Open Platform Setup

1. Go to [Feishu Open Platform](https://open.feishu.cn/) and create a new app
2. Under **Credentials**, copy the **App ID** and **App Secret**
3. Under **Event Subscriptions**:
   - Enable the **WebSocket** connection mode
   - Subscribe to `im.message.receive_v1`
4. Under **Permissions**, add:
   - `im:message` — send messages
   - `im:message:readonly` — receive messages
   - `im:message.group_at_msg:readonly` — receive group messages where the bot is @mentioned
5. Publish the app version and have an admin approve it

## Configuration

```yaml
# golem.yaml
channels:
  feishu:
    appId: ${FEISHU_APP_ID}
    appSecret: ${FEISHU_APP_SECRET}
    # sendMarkdownAsCard: true   # optional: use interactive cards for Markdown replies
```

```sh
# .env
FEISHU_APP_ID=cli_xxxxxxxxxx
FEISHU_APP_SECRET=xxxxxxxxxxxxxxxxxx
```

### Message Format Options

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `appId` | `string` | — | Feishu App ID (required) |
| `appSecret` | `string` | — | Feishu App Secret (required) |
| `sendMarkdownAsCard` | `boolean` | `false` | When `true`, Markdown replies are sent as interactive cards (`msg_type: "interactive"`) with native `lark_md` rendering. When `false` (default), Markdown replies are sent as post rich text (`msg_type: "post"`) |

The adapter automatically detects whether the AI reply contains Markdown formatting:

- **Plain text** — sent as `msg_type: "text"` (no conversion)
- **Markdown (default)** — converted to Feishu post rich text (`msg_type: "post"`): headings become bold, lists get bullet prefixes, code blocks are wrapped with box-drawing characters
- **Markdown (card mode)** — sent as interactive card (`msg_type: "interactive"`) with native Markdown rendering including code blocks and tables

## How It Works

- **Transport**: WebSocket long-connection via `WSClient` from `@larksuiteoapi/node-sdk`
- **Events**: Listens for `im.message.receive_v1` events (text messages only)
- **Reply**: Sends messages via `client.im.v1.message.create()` — format is auto-selected based on content and config
- **Chat types**: Supports both DMs and group chats
- **Group @mention filter**: In group chats the bot only responds when directly @mentioned. The @mention key is automatically stripped from the message text before it is passed to the engine

## Start

```bash
golembot gateway --verbose
```

The adapter connects to Feishu via WebSocket on startup. Messages appear in logs with `[feishu]` prefix when `--verbose` is enabled.

## Notes

- WebSocket mode means the bot works behind NAT/firewalls without port forwarding
- Only text messages are processed; images, files, and other types are ignored
- The adapter automatically handles connection lifecycle
- In group chats, the bot only responds to messages that directly @mention it — it ignores all other group traffic
