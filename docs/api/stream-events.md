# StreamEvent

`StreamEvent` is the union type for all events yielded by `assistant.chat()`. It provides a unified interface across all engines.

## Type Definition

```typescript
type StreamEvent =
  | { type: 'text'; content: string }
  | { type: 'tool_call'; name: string; args: string }
  | { type: 'tool_result'; content: string }
  | { type: 'warning'; message: string }
  | { type: 'error'; message: string }
  | { type: 'done'; sessionId?: string; durationMs?: number;
      costUsd?: number; numTurns?: number; fullText?: string };
```

## Event Types

### `text`

Streamed text content from the agent.

```typescript
{ type: 'text', content: 'Here is the analysis...' }
```

Multiple `text` events form the complete response. Concatenate `content` fields to build the full text.

### `tool_call`

The agent is invoking a tool (reading a file, running a command, etc.).

```typescript
{ type: 'tool_call', name: 'readFile', args: '{"path": "data.csv"}' }
```

| Field | Description |
|-------|-------------|
| `name` | Tool name (e.g., `readFile`, `bash`, `writeFile`) |
| `args` | JSON string of tool arguments |

### `tool_result`

The result of a tool invocation.

```typescript
{ type: 'tool_result', content: 'File contents here...' }
```

### `warning`

Non-fatal warning from the engine.

```typescript
{ type: 'warning', message: 'Running with --dangerously-skip-permissions' }
```

### `error`

An error occurred during processing.

```typescript
{ type: 'error', message: 'Engine process exited with code 1' }
```

### `done`

Signals the end of a conversation turn.

```typescript
{
  type: 'done',
  sessionId: 'abc-123',
  durationMs: 12345,
  costUsd: 0.042,
  numTurns: 3
}
```

| Field | Description | Availability |
|-------|-------------|-------------|
| `sessionId` | Engine session ID for resume | All engines |
| `durationMs` | Wall-clock duration | All engines |
| `costUsd` | API cost in USD | Claude Code, OpenCode |
| `numTurns` | Number of agent turns | Claude Code |
| `fullText` | Complete agent response text | Cursor, Claude Code |

## Consuming Events

### Print text only

```typescript
for await (const event of assistant.chat('Hello')) {
  if (event.type === 'text') process.stdout.write(event.content);
}
```

### Full event handling

```typescript
let fullText = '';

for await (const event of assistant.chat('Analyze the data')) {
  switch (event.type) {
    case 'text':
      fullText += event.content;
      break;
    case 'tool_call':
      console.log(`[tool] ${event.name}`);
      break;
    case 'tool_result':
      console.log(`[result] ${event.content.slice(0, 100)}...`);
      break;
    case 'error':
      console.error(`[error] ${event.message}`);
      break;
    case 'done':
      console.log(`Done in ${event.durationMs}ms`);
      break;
  }
}
```

### Accumulate for IM reply

```typescript
let reply = '';
for await (const event of assistant.chat(message)) {
  if (event.type === 'text') reply += event.content;
}
await sendToIM(reply);
```
