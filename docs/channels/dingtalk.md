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
```

```sh
# .env
DINGTALK_CLIENT_ID=dingxxxxxxxxxx
DINGTALK_CLIENT_SECRET=xxxxxxxxxxxxxxxxxx
```

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

## Notes

- Stream mode uses outbound WebSocket — works behind NAT/firewalls
- Replies are sent to the session webhook URL provided in each incoming message
- The max message length is 4,000 characters; longer responses are automatically split
