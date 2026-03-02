# Telegram

GolemBot connects to Telegram via **Long-Polling** — no public URL required. The bot responds to private messages and group @mentions.

## Prerequisites

- A Telegram account
- Node.js ≥ 18

## Install the SDK

```bash
npm install grammy
```

## Create a Bot

1. Open Telegram and message [@BotFather](https://t.me/BotFather).
2. Send `/newbot` and follow the prompts. You'll receive a **Bot Token** in the format `123456:ABCdef...`.
3. To use the bot in groups, send `/setprivacy` → select your bot → **Disable** (allows the bot to read group messages).

## Configure golem.yaml

```yaml
name: my-assistant
engine: claude-code

channels:
  telegram:
    botToken: ${TELEGRAM_BOT_TOKEN}   # 123456:ABCdef...
```

Set environment variables before running:

```bash
export TELEGRAM_BOT_TOKEN=123456:ABCdef...
golem gateway
```

## How It Works

| Chat type | Behavior |
|-----------|----------|
| Private chat | Always responds |
| Group @mention (`@YourBot message`) | Strips `@botname`, then responds |
| Group message without @mention | Ignored |

Each conversation (private chat or group) maintains its own session context.

## Message Limits

Telegram messages are split at **4,096 characters** per chunk if the response is longer.
