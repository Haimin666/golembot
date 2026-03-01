# Channel Adapter

The `ChannelAdapter` interface defines how GolemBot connects to IM platforms.

## ChannelAdapter Interface

```typescript
interface ChannelAdapter {
  readonly name: string;
  start(onMessage: (msg: ChannelMessage) => void): Promise<void>;
  reply(msg: ChannelMessage, text: string): Promise<void>;
  stop(): Promise<void>;
}
```

| Method | Description |
|--------|-------------|
| `name` | Adapter name (e.g., `'feishu'`, `'dingtalk'`, `'wecom'`) |
| `start(onMessage)` | Connect to the IM platform and begin listening. Call `onMessage` for each incoming message. |
| `reply(msg, text)` | Send a text reply to the original message |
| `stop()` | Gracefully disconnect |

## ChannelMessage Type

```typescript
interface ChannelMessage {
  channelType: string;     // 'feishu' | 'dingtalk' | 'wecom'
  senderId: string;        // User ID on the platform
  senderName?: string;     // Display name (if available)
  chatId: string;          // Chat/conversation ID
  chatType: 'dm' | 'group';
  text: string;            // Message text content
  raw: unknown;            // Raw SDK event object
}
```

## Helper Functions

### `buildSessionKey(msg)`

Generate a session key from a channel message:

```typescript
function buildSessionKey(msg: ChannelMessage): string;
// Returns: `${channelType}:${chatId}:${senderId}`
```

Example: `"feishu:oc_xxx:ou_yyy"`

### `stripMention(text)`

Remove `@` mentions from message text:

```typescript
function stripMention(text: string): string;
```

Handles:
- XML-style: `<at user_id="xxx">BotName</at>`
- Plain text: `@BotName`

## Implementing a Custom Adapter

To add a new IM channel, implement the `ChannelAdapter` interface:

```typescript
import type { ChannelAdapter, ChannelMessage } from 'golembot';

class SlackAdapter implements ChannelAdapter {
  readonly name = 'slack';

  async start(onMessage: (msg: ChannelMessage) => void) {
    // Connect to Slack via RTM or Events API
    // On each incoming message, call:
    onMessage({
      channelType: 'slack',
      senderId: event.user,
      chatId: event.channel,
      chatType: event.channel_type === 'im' ? 'dm' : 'group',
      text: event.text,
      raw: event,
    });
  }

  async reply(msg: ChannelMessage, text: string) {
    // Send reply via Slack API
  }

  async stop() {
    // Disconnect
  }
}
```

Then integrate with `createAssistant()` to handle the message routing:

```typescript
import { createAssistant, buildSessionKey, stripMention } from 'golembot';

const assistant = createAssistant({ dir: './my-bot' });
const adapter = new SlackAdapter();

await adapter.start(async (msg) => {
  const sessionKey = buildSessionKey(msg);
  const text = stripMention(msg.text);

  let reply = '';
  for await (const event of assistant.chat(text, { sessionKey })) {
    if (event.type === 'text') reply += event.content;
  }
  await adapter.reply(msg, reply);
});
```

## Built-in Adapters

| Adapter | Module | SDK |
|---------|--------|-----|
| `FeishuAdapter` | `golembot/channels/feishu` | `@larksuiteoapi/node-sdk` |
| `DingtalkAdapter` | `golembot/channels/dingtalk` | `dingtalk-stream` |
| `WecomAdapter` | `golembot/channels/wecom` | `@wecom/crypto` + `xml2js` |

These are internal to GolemBot and used by the gateway service. They are not currently exported for direct use — use the gateway or implement your own adapter following the interface above.
