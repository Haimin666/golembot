# FAQ

## Which engine should I choose?

- **Cursor** — if you already use Cursor IDE and have a subscription
- **Claude Code** — best overall experience; provides cost tracking and turn counts
- **OpenCode** — if you want multi-provider flexibility (Anthropic, OpenAI, OpenRouter, etc.)

All three produce the same `StreamEvent` interface, so you can switch at any time by changing one line in `golem.yaml`.

## How do I set API keys?

Each engine uses its own environment variable:

| Engine | Variable |
|--------|----------|
| Cursor | `CURSOR_API_KEY` |
| Claude Code | `ANTHROPIC_API_KEY` |
| OpenCode | Depends on provider (e.g., `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`) |

Place them in a `.env` file in the assistant directory — the CLI loads it automatically.

## How does session management work?

- Each `sessionKey` maps to an independent engine session
- Sessions are stored in `.golem/sessions.json`
- The default session key is `"default"` (used when no key is specified)
- Sessions are resumed automatically via the engine's native `--resume` / `--session` flag
- If resume fails (engine-side expiration), a new session is started transparently
- Use `golembot run` → `/reset` or `assistant.resetSession()` to clear a session manually

## Can multiple users share one assistant?

Yes. Use different `sessionKey` values for each user:

```typescript
assistant.chat('Hello', { sessionKey: 'user-alice' });
assistant.chat('Hello', { sessionKey: 'user-bob' });
```

Same-key calls are serialized; different-key calls run in parallel. The gateway handles this automatically for IM channels using `${channelType}:${chatId}:${senderId}` as the session key.

## What files does `golembot init` create?

| File/Dir | Purpose |
|----------|---------|
| `golem.yaml` | Assistant configuration |
| `skills/` | Skill directory (with `general` and `im-adapter`) |
| `AGENTS.md` | Auto-generated agent context |
| `.golem/` | Internal state (sessions, gitignored) |
| `.gitignore` | Ignores `.golem/` |

## Can I use GolemBot without the CLI?

Yes. GolemBot's core is an importable TypeScript library:

```typescript
import { createAssistant } from 'golembot';
const assistant = createAssistant({ dir: './my-bot' });
```

The CLI (`golembot`) is just one consumer of this library.

## How do I add a custom skill?

Create a directory under `skills/` containing a `SKILL.md` file with YAML frontmatter (`name` + `description`). That's it. See [Create a Skill](/skills/create-skill).

## Why is `CLAUDE.md` a symlink to `AGENTS.md`?

Claude Code reads `CLAUDE.md` for project-level instructions. Instead of maintaining two files, GolemBot generates `AGENTS.md` (listing skills, conventions) and symlinks `CLAUDE.md` to it. Both files always stay in sync.

## Can Feishu/DingTalk work behind NAT?

Yes. Both use outbound WebSocket connections — no public IP or port forwarding required. Only WeCom requires inbound HTTP (a publicly reachable URL).

## How do I check if everything is set up correctly?

```bash
golembot doctor
```

This checks Node.js version, `golem.yaml`, engine binary, API keys, and skills.

## Where are logs stored?

GolemBot does not maintain log files. Engine output is streamed directly. Use `--verbose` with `golembot gateway` for per-channel debug output on stderr.
