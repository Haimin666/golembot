# Channel Overview

GolemBot's gateway connects your assistant to IM platforms. Each platform is handled by a **channel adapter** that translates between the IM SDK and GolemBot's `assistant.chat()` API.

## Supported Channels

| Channel | Transport | Public IP Required | SDK |
|---------|-----------|-------------------|-----|
| [Feishu (Lark)](/channels/feishu) | WebSocket | No | `@larksuiteoapi/node-sdk` |
| [DingTalk](/channels/dingtalk) | Stream (WebSocket) | No | `dingtalk-stream` |
| [WeCom](/channels/wecom) | Webhook HTTP | **Yes** | `@wecom/crypto` + `xml2js` |

## Architecture

```
IM Platform → Channel Adapter → assistant.chat() → text response → adapter.reply()
```

The gateway:

1. Reads `channels` config from `golem.yaml`
2. Dynamically imports the SDK for each configured channel
3. Starts all adapters in parallel alongside the HTTP service
4. Routes incoming messages through `buildSessionKey()` → `stripMention()` → `assistant.chat()`
5. Accumulates the full text response, splits it within platform limits, and sends chunk by chunk

## Message Limits

Each platform has a maximum message length. GolemBot automatically splits long responses:

| Channel | Max length | Split behavior |
|---------|-----------|---------------|
| Feishu | 4,000 chars | Multi-message |
| DingTalk | 4,000 chars | Multi-message |
| WeCom | 2,048 chars | Multi-message |

## Session Routing

Each IM message is assigned a session key: `${channelType}:${chatId}:${senderId}`. This means:

- Each user in each chat gets their own independent conversation context
- The same user in different group chats has different sessions
- DMs and group messages are isolated

## Mention Handling

GolemBot strips `@` mentions from incoming messages before passing them to the agent. This handles patterns like `<at user_id="xxx">BotName</at>` (Feishu XML) and `@BotName` (plain text).

## Starting the Gateway

```bash
golembot gateway --verbose
```

The `--verbose` flag enables per-channel log lines, useful for debugging.

## SDK Dependencies

Channel SDKs are **optional peer dependencies**. Install only what you need:

```bash
# Feishu
pnpm add @larksuiteoapi/node-sdk

# DingTalk
pnpm add dingtalk-stream

# WeCom
pnpm add @wecom/crypto xml2js
```

If a configured channel's SDK is not installed, the gateway will print an error with installation instructions.
