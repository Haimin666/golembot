# Channel Adapter

`ChannelAdapter` 接口定义 GolemBot 如何连接 IM 平台。

## ChannelAdapter 接口

```typescript
interface ChannelAdapter {
  readonly name: string;
  start(onMessage: (msg: ChannelMessage) => void): Promise<void>;
  reply(msg: ChannelMessage, text: string): Promise<void>;
  stop(): Promise<void>;
}
```

## ChannelMessage 类型

```typescript
interface ChannelMessage {
  channelType: string;     // 'feishu' | 'dingtalk' | 'wecom'
  senderId: string;        // 平台上的用户 ID
  senderName?: string;     // 显示名称
  chatId: string;          // 会话/群组 ID
  chatType: 'dm' | 'group';
  text: string;            // 消息文本
  raw: unknown;            // 原始 SDK 事件对象
}
```

## 辅助函数

### `buildSessionKey(msg)`

从通道消息生成会话 Key：`${channelType}:${chatId}:${senderId}`

### `stripMention(text)`

移除消息中的 `@` 提及，处理 `<at ...>...</at>` XML 格式和 `@BotName` 纯文本格式。

## 实现自定义适配器

```typescript
import type { ChannelAdapter, ChannelMessage } from 'golembot';
import { createAssistant, buildSessionKey, stripMention } from 'golembot';

class SlackAdapter implements ChannelAdapter {
  readonly name = 'slack';

  async start(onMessage: (msg: ChannelMessage) => void) {
    // 连接 Slack，收到消息时调用 onMessage
  }

  async reply(msg: ChannelMessage, text: string) {
    // 通过 Slack API 发送回复
  }

  async stop() { /* 断开连接 */ }
}

// 使用
const assistant = createAssistant({ dir: './my-bot' });
const adapter = new SlackAdapter();

await adapter.start(async (msg) => {
  let reply = '';
  for await (const ev of assistant.chat(stripMention(msg.text), {
    sessionKey: buildSessionKey(msg),
  })) {
    if (ev.type === 'text') reply += ev.content;
  }
  await adapter.reply(msg, reply);
});
```
