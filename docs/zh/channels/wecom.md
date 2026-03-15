# 企业微信

通过官方 AI Bot SDK 的 WebSocket 模式将 GolemBot 助手接入企业微信。**无需公网 IP。**

## 前置条件

```bash
pnpm add @wecom/aibot-node-sdk
```

## 企业微信管理后台配置

1. 前往[企业微信管理后台](https://work.weixin.qq.com/) → **应用管理** → 创建新的 AI Bot
2. 记下 **Bot ID** 和 **Secret**
3. SDK 使用 WebSocket 连接——无需配置回调 URL

## 配置

```yaml
# golem.yaml
channels:
  wecom:
    botId: ${WECOM_BOT_ID}
    secret: ${WECOM_SECRET}
    # websocketUrl: wss://custom-endpoint  # 可选，用于私有化部署
```

```sh
# .env
WECOM_BOT_ID=xxxxxxxxxx
WECOM_SECRET=xxxxxxxxxxxxxxxxxx
```

## 工作原理

- **传输方式**：通过 `@wecom/aibot-node-sdk` 建立 WebSocket 长连接
- **连接**：SDK 自动建立并维护与企业微信服务器的 WebSocket 连接
- **重连**：SDK 自动处理重连和心跳
- **消息**：通过 WebSocket 事件接收入站消息，转换为 `ChannelMessage`（仅文本）
- **回复**：通过 SDK 内置的回复方法发送消息
- **主动消息**：支持 `send()` —— 适配器可以主动向任意会话发送消息
- **会话类型**：始终为 `dm`（企业微信 Bot 消息为私聊）

## 启动

```bash
golembot gateway --verbose
```

适配器通过 WebSocket 自动连接企业微信，无需端口映射或公网 IP。

## 说明

- 与飞书和钉钉一样，企业微信现在也使用 **WebSocket** —— 无需公网 IP 或反向代理
- `@wecom/aibot-node-sdk` 自动处理重连和心跳
- 最大消息长度 2,048 字符；更长的回复会自动拆分
- 仅处理文本消息
