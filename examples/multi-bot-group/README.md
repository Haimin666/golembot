# Multi-Bot Group Chat Demo

Demonstrates two GolemBot instances sharing a mock group channel, showcasing:

- **Group-scoped sessions** — all bots share one session key per room (`channelType:chatId`)
- **`smart` mode** — `researcher` observes every message and speaks only when it has something valuable to add, outputting `[PASS]` otherwise
- **`mention-only` mode** — `coder` stays silent until explicitly @mentioned
- **Multi-bot collaboration** — bots can @mention each other to hand off tasks
- **maxTurns protection** — prevents runaway bot-to-bot conversation loops
- **Group memory** — each bot maintains `memory/groups/<room>.md` for persistent context

## Bots

| Bot | Policy | Role |
|-----|--------|------|
| `researcher` | `smart` | Synthesizes information, provides context, observes all messages |
| `coder` | `mention-only` | Code specialist, only responds when @mentioned |

## Run

```bash
# From the repo root
ANTHROPIC_API_KEY=sk-... node examples/multi-bot-group/run.mjs

# With verbose gateway logs
ANTHROPIC_API_KEY=sk-... GOLEM_VERBOSE=1 node examples/multi-bot-group/run.mjs
```

## What happens

1. `alice` sends: *"@researcher What are the trade-offs between REST and GraphQL? Then ask @coder to show a minimal resolver."*
2. **researcher** (smart mode) answers alice's question and @mentions coder
3. **coder** (mention-only) wakes up and provides a code example
4. **researcher** may add follow-up context if it has something to contribute
5. After ~8s of silence the demo prints stats and exits

## Architecture

```
alice's message
    │
    ├─→ researcher adapter.start callback
    │   policy=smart → agent called for all messages
    │   [PASS] if nothing to add
    │   reply → broadcast to room
    │
    ├─→ coder adapter.start callback
    │   policy=mention-only → skipped (not @coder)
    │
researcher's reply (broadcasts back to room)
    │
    ├─→ researcher → [PASS] (just said something, no need to respond to itself)
    │
    └─→ coder → @coder found → agent called → code example
```

## Custom adapter

`adapters/mock-group-adapter.mjs` uses a shared Node.js `EventEmitter` (`GroupRoom`) as the channel bus. Any adapter instance that joins the same room emitter will receive all messages and can broadcast replies. This fully simulates a real group chat without needing actual IM credentials.

To extend this pattern to real platforms, replace `MockGroupAdapter` with a `FeishuAdapter`, `SlackAdapter`, etc.
