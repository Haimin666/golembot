# WeCom (WeChat Work)

Connect your GolemBot assistant to WeCom using webhook callback mode. **Requires a public URL** for WeCom to send events to.

## Prerequisites

```bash
pnpm add @wecom/crypto xml2js
```

## WeCom Admin Setup

1. Go to [WeCom Admin Console](https://work.weixin.qq.com/) → **App Management** → create a new app
2. Note down the **Corp ID**, **Agent ID**, and **Secret**
3. Under **Receive Messages** → **API Settings**:
   - Set the callback URL to `http://<your-host>:<port>/wecom`
   - Generate and note down the **Token** and **Encoding AES Key**
4. Set the appropriate permissions for the app

## Configuration

```yaml
# golem.yaml
channels:
  wecom:
    corpId: ${WECOM_CORP_ID}
    agentId: ${WECOM_AGENT_ID}
    secret: ${WECOM_SECRET}
    token: ${WECOM_TOKEN}
    encodingAESKey: ${WECOM_ENCODING_AES_KEY}
    port: 9000    # optional, default: 9000
```

```sh
# .env
WECOM_CORP_ID=wwxxxxxxxxxx
WECOM_AGENT_ID=1000001
WECOM_SECRET=xxxxxxxxxxxxxxxxxx
WECOM_TOKEN=xxxxxxxxxx
WECOM_ENCODING_AES_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

## How It Works

- **Transport**: HTTP webhook server listening on `GET /wecom` (verification) and `POST /wecom` (messages)
- **Verification**: `GET /wecom` handles WeCom's echo verification using signature check + AES decryption
- **Messages**: `POST /wecom` decrypts XML payload → parses → emits `ChannelMessage` (text only)
- **Reply**: Sends messages via `POST https://qyapi.weixin.qq.com/cgi-bin/message/send` with cached access token (auto-refreshed with 5-minute margin)
- **Chat type**: Always `dm` (WeCom webhook messages are direct messages)

## Port Configuration

The WeCom adapter runs its own HTTP server (separate from the gateway's HTTP service) on the configured `port` (default: `9000`). Make sure this port is accessible from WeCom's servers.

## Start

```bash
golembot gateway --verbose
```

The adapter starts an HTTP server on the configured port. WeCom sends webhook events to `http://<your-host>:9000/wecom`.

## Notes

- Unlike Feishu and DingTalk, WeCom requires **inbound HTTP** — your server must be reachable from the internet
- Use a reverse proxy (nginx, Caddy) or tunnel (ngrok, Cloudflare Tunnel) if running locally
- The max message length is 2,048 characters; longer responses are automatically split
- Only text messages are processed
