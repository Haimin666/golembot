# Telegram

GolemBot 通过 **Long-Polling（长轮询）** 连接 Telegram，无需公网 URL。支持私聊和群组内 @mention 响应。

## 前置条件

- 一个 Telegram 账号
- Node.js ≥ 18

## 安装 SDK

```bash
npm install grammy
```

## 创建 Bot

1. 打开 Telegram，搜索 [@BotFather](https://t.me/BotFather) 并发送消息。
2. 发送 `/newbot`，按提示操作，完成后会收到一个 **Bot Token**，格式为 `123456:ABCdef...`。
3. 若需要在群组中使用，发送 `/setprivacy` → 选择你的 Bot → 选择 **Disable**（允许 Bot 读取群组消息）。

## 配置 golem.yaml

```yaml
name: my-assistant
engine: claude-code

channels:
  telegram:
    botToken: ${TELEGRAM_BOT_TOKEN}   # 123456:ABCdef...
```

运行前设置环境变量：

```bash
export TELEGRAM_BOT_TOKEN=123456:ABCdef...
golem gateway
```

## 工作原理

| 场景 | 行为 |
|------|------|
| 私聊 | 始终响应 |
| 群组 @mention（`@机器人名 消息`） | 去掉 `@botname` 后处理 |
| 群组普通消息（无 @mention） | 忽略 |

每个会话（私聊或群组）维护独立的对话上下文。

## 消息长度限制

响应超过 **4,096 字符** 时会自动分段发送。
