# createAssistant()

The main entry point for using GolemBot as a library.

## Signature

```typescript
import { createAssistant } from 'golembot';

function createAssistant(opts: CreateAssistantOpts): Assistant;
```

## CreateAssistantOpts

```typescript
interface CreateAssistantOpts {
  dir: string;        // Path to the assistant directory
  engine?: string;    // Override engine from golem.yaml
  model?: string;     // Override model from golem.yaml
  apiKey?: string;    // Agent API key
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `dir` | `string` | Yes | Absolute or relative path to the assistant directory (must contain `golem.yaml`) |
| `engine` | `string` | No | Override the `engine` field in `golem.yaml`. One of `cursor`, `claude-code`, `opencode` |
| `model` | `string` | No | Override the `model` field in `golem.yaml` |
| `apiKey` | `string` | No | API key passed to the engine. Alternatively set via environment variables (`CURSOR_API_KEY`, `ANTHROPIC_API_KEY`, etc.) |

## Assistant Interface

```typescript
interface Assistant {
  chat(message: string, opts?: ChatOpts): AsyncIterable<StreamEvent>;
  init(opts: { engine: string; name: string }): Promise<void>;
  resetSession(sessionKey?: string): Promise<void>;
}
```

### `chat(message, opts?)`

Send a message and receive a stream of events.

```typescript
interface ChatOpts {
  sessionKey?: string;   // default: "default"
}
```

Returns an `AsyncIterable<StreamEvent>`. See [StreamEvent](/api/stream-events) for all event types.

**Concurrency**: calls with the same `sessionKey` are serialized (queued). Different `sessionKey`s run in parallel.

```typescript
// Single user
for await (const event of assistant.chat('Hello')) {
  if (event.type === 'text') process.stdout.write(event.content);
}

// Multi-user
for await (const event of assistant.chat('Hello', { sessionKey: 'user-123' })) {
  // ...
}
```

### `init(opts)`

Initialize a new assistant directory. Creates `golem.yaml`, copies built-in skills, generates `AGENTS.md`.

```typescript
await assistant.init({ engine: 'claude-code', name: 'my-bot' });
```

Throws if `golem.yaml` already exists.

### `resetSession(sessionKey?)`

Clear the session for a given key (default: `"default"`).

```typescript
await assistant.resetSession();            // clear default session
await assistant.resetSession('user-123');   // clear specific session
```

## Usage Examples

### Basic

```typescript
import { createAssistant } from 'golembot';

const assistant = createAssistant({ dir: './my-bot' });

for await (const event of assistant.chat('What files are in this directory?')) {
  switch (event.type) {
    case 'text':
      process.stdout.write(event.content);
      break;
    case 'done':
      console.log(`\n(${event.durationMs}ms, $${event.costUsd})`);
      break;
  }
}
```

### Multi-User

```typescript
const assistant = createAssistant({ dir: './shared-bot' });

// These can run in parallel (different sessionKeys)
const session1 = assistant.chat('Task A', { sessionKey: 'user-1' });
const session2 = assistant.chat('Task B', { sessionKey: 'user-2' });
```

### Override Engine

```typescript
const assistant = createAssistant({
  dir: './my-bot',
  engine: 'opencode',
  model: 'anthropic/claude-sonnet',
  apiKey: 'sk-ant-xxx',
});
```

## Re-exports

The `golembot` package also re-exports:

```typescript
export type { StreamEvent } from './engine.js';
export type { GolemConfig, SkillInfo, ChannelsConfig, GatewayConfig,
              FeishuChannelConfig, DingtalkChannelConfig,
              WecomChannelConfig } from './workspace.js';
export { createGolemServer, startServer, type ServerOpts } from './server.js';
export type { ChannelAdapter, ChannelMessage } from './channel.js';
export { buildSessionKey, stripMention } from './channel.js';
export { startGateway } from './gateway.js';
```
