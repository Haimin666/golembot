# 通道概览

GolemBot 的 Gateway 将你的助手接入 IM 平台。每个平台由一个**通道适配器**处理，在 IM SDK 和 GolemBot 的 `assistant.chat()` API 之间转换。

## 支持的通道

| 通道 | 传输方式 | 需要公网 IP | SDK |
|------|----------|------------|-----|
| [飞书](/zh/channels/feishu) | WebSocket | 否 | `@larksuiteoapi/node-sdk` |
| [钉钉](/zh/channels/dingtalk) | Stream（WebSocket） | 否 | `dingtalk-stream` |
| [企业微信](/zh/channels/wecom) | Webhook HTTP | **是** | `@wecom/crypto` + `xml2js` |

## 消息长度限制

每个平台有最大消息长度。GolemBot 自动拆分长回复：

| 通道 | 最大长度 | 拆分方式 |
|------|----------|----------|
| 飞书 | 4,000 字符 | 多条消息 |
| 钉钉 | 4,000 字符 | 多条消息 |
| 企业微信 | 2,048 字符 | 多条消息 |

## 会话路由

每条 IM 消息分配一个会话 Key：`${channelType}:${chatId}:${senderId}`。即：

- 每个用户在每个聊天中有独立的对话上下文
- 同一用户在不同群聊中有不同会话
- 私聊和群聊消息隔离

## SDK 依赖

通道 SDK 是**可选的 peer 依赖**。只安装你需要的：

```bash
# 飞书
pnpm add @larksuiteoapi/node-sdk

# 钉钉
pnpm add dingtalk-stream

# 企业微信
pnpm add @wecom/crypto xml2js
```

如果已配置的通道 SDK 未安装，Gateway 会打印错误信息和安装指引。
