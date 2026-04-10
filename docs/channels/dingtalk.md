# DingTalk

Connect your GolemBot assistant to DingTalk using Stream mode (WebSocket). No public IP required.

## Prerequisites

```bash
pnpm add dingtalk-stream
```

## DingTalk Open Platform Setup

1. Go to [DingTalk Developer Portal](https://open-dev.dingtalk.com/) and create a robot application
2. Under **Credentials**, copy the **Client ID** (AppKey) and **Client Secret** (AppSecret)
3. Under **Message Push**, select **Stream mode**
4. Configure the bot's permissions as needed

## Configuration

```yaml
# golem.yaml
channels:
  dingtalk:
    clientId: ${DINGTALK_CLIENT_ID}
    clientSecret: ${DINGTALK_CLIENT_SECRET}
    # Optional: interactive card template ID for streaming typewriter effect
    cardTemplateId: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx.schema
```

```sh
# .env
DINGTALK_CLIENT_ID=dingxxxxxxxxxx
DINGTALK_CLIENT_SECRET=xxxxxxxxxxxxxxxxxx
```

### Streaming Cards (Optional)

To enable typewriter streaming effect, create an interactive card template in DingTalk:

1. Create a card template in DingTalk Developer Portal
2. Copy the template ID to `cardTemplateId` field
3. The card template must include a variable named `content`

## How It Works

- **Transport**: Stream mode via `DWClient` from `dingtalk-stream`, using the `TOPIC_ROBOT` topic
- **Events**: Receives robot messages via the stream connection
- **Reply**: Posts response to `data.sessionWebhook` with `x-acs-dingtalk-access-token` header
- **Chat types**: Supports both DMs and group chats

## Start

```bash
golembot gateway --verbose
```

The adapter connects to DingTalk's stream service on startup. Messages appear with `[dingtalk]` prefix when `--verbose` is enabled.

## Group Chat

DingTalk server groups are treated as **group** chats. Configure the response policy via `groupChat` in `golem.yaml`:

```yaml
groupChat:
  groupPolicy: mention-only  # recommended for DingTalk
```

::: warning Platform Limitation
DingTalk's Stream SDK (`TOPIC_ROBOT`) **only delivers messages where the bot is @mentioned**. Non-mention group messages are never sent to the bot process. This means:

- `mention-only` — works as expected
- `smart` — cannot observe non-mention messages for group context accumulation
- `always` — behaves the same as `mention-only` (platform-side filtering)

For best results, use `mention-only` with DingTalk.
:::

## Notes

- Stream mode uses outbound WebSocket — works behind NAT/firewalls
- Replies are sent to the session webhook URL provided in each incoming message
- The max message length is 4,000 characters; longer responses are automatically split
