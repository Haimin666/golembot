# WeChat (微信)

Connect your GolemBot assistant to personal WeChat using the iLink Bot API. **No public IP required. No SDK dependency.**

::: tip Zero dependencies
Unlike other channels, the WeChat adapter uses only the built-in `fetch` API to communicate with the iLink Bot service. No npm packages to install.
:::

## Prerequisites

- A personal WeChat account (the bot will operate as this account)
- The `golembot` CLI installed

## Get Your Token

Run the built-in login command to authenticate via QR code:

```bash
golembot weixin-login
```

1. A QR code will appear in your terminal
2. Open WeChat on your phone → Scan
3. Confirm the login
4. The script prints your **bearer token** — copy it

::: warning Token security
This token grants access to send and receive messages as your WeChat account. Store it securely and never commit it to version control.
:::

## Configuration

```yaml
# golem.yaml
channels:
  weixin:
    token: ${WEIXIN_BOT_TOKEN}
    # baseUrl: https://ilinkai.weixin.qq.com  # optional, default
```

```sh
# .env or shell
export WEIXIN_BOT_TOKEN="your-token-from-qr-login"
```

## How It Works

- **Transport**: HTTP long-polling against Tencent's iLink Bot API (`ilinkai.weixin.qq.com`)
- **Connection**: The adapter polls `POST /ilink/bot/getupdates` in a loop; each poll blocks for up to 35 seconds waiting for new messages
- **Reconnection**: Automatic retry with exponential backoff (1s → 2s → 4s → ... → 30s cap). On HTTP 401 (token expired), polling stops with a clear error
- **Messages**: Supports text, image (placeholder), voice (with transcription), file, and video message types
- **Reply**: Sends messages via `POST /ilink/bot/sendmessage` with the required `context_token` from each inbound message
- **Chat type**: Currently `dm` only (direct messages)

## Start

```bash
golembot gateway --verbose
```

You should see:

```
[weixin] adapter started, polling...

Channels (1 connected)
● WeChat
```

Send a message to the bot's WeChat account from another WeChat user — you'll see the response arrive in WeChat.

## Limitations

- **No proactive messaging** — the iLink Bot API requires a `context_token` from an inbound message to reply. The bot cannot initiate conversations (scheduled tasks targeting WeChat are not supported)
- **No typing indicator** — the iLink API does not support "typing..." status
- **No group chat** — currently DM only
- **No history fetch** — the iLink API does not provide message history
- **Token expiry** — the bearer token may expire after some time; re-run the QR login to obtain a new one
- **Message length** — WeChat limits messages to 2,000 characters; longer responses are automatically split by GolemBot

## Notes

- The iLink Bot API is a Tencent service — it is not part of the official WeChat Open Platform
- No npm SDK is needed; the adapter uses native `fetch()`
- The `context_token` is automatically managed per sender — you don't need to handle it manually
