# Getting Started

## Prerequisites

- **Node.js** >= 18
- A Coding Agent CLI installed:
  - [Cursor](https://docs.cursor.com/agent) (`agent` CLI)
  - [Claude Code](https://docs.anthropic.com/en/docs/claude-code) (`claude` CLI)
  - [OpenCode](https://github.com/opencode-ai/opencode) (`opencode` CLI)
  - [Codex](https://developers.openai.com/codex/cli) (`codex` CLI)

## Install

```bash
npm install -g golembot
```

Or with pnpm / yarn:

```bash
pnpm add -g golembot
# or
yarn global add golembot
```

## Quick Start

### Option A: Guided Setup (Recommended)

```bash
mkdir my-bot && cd my-bot
golembot onboard
```

The [onboard wizard](/guide/onboard-wizard) walks you through engine selection, naming, IM channel setup, and scenario template selection in 7 interactive steps.

### Option B: Manual Init

```bash
mkdir my-bot && cd my-bot
golembot init -e claude-code -n my-bot
```

This creates:
- `golem.yaml` — assistant configuration
- `skills/` — skill directory with built-in skills (`general` + `im-adapter`)
- `AGENTS.md` — auto-generated context for the Coding Agent
- `.golem/` — internal state directory (gitignored)

### Start a Conversation

```bash
golembot run
```

This opens an interactive REPL. Type your message and press Enter. The Coding Agent handles everything — reading files, running scripts, multi-step reasoning.

**REPL commands:**
- `/help` — show available commands
- `/reset` — clear the current session
- `/quit` or `/exit` — exit

### Start the Gateway Service

```bash
golembot gateway
```

This starts both an HTTP API and any configured IM channel adapters. GolemBot supports the following IM platforms out of the box:

| Platform | Connection Mode |
|----------|----------------|
| [Feishu (Lark)](/channels/feishu) | WebSocket (no public IP needed) |
| [DingTalk](/channels/dingtalk) | Stream mode (no public IP needed) |
| [WeCom](/channels/wecom) | Webhook (requires public URL) |
| [Slack](/channels/slack) | Socket Mode (no public IP needed) |
| [Telegram](/channels/telegram) | Polling (no public IP needed) |
| [Discord](/channels/discord) | Gateway API (no public IP needed) |

See [Channels Overview](/channels/overview) for setup instructions.

## Use as a Library

GolemBot's core is an importable TypeScript library:

```typescript
import { createAssistant } from 'golembot';

const assistant = createAssistant({ dir: './my-bot' });

for await (const event of assistant.chat('Analyze the sales data')) {
  if (event.type === 'text') process.stdout.write(event.content);
}
```

This pattern works for embedding into Slack bots, internal tools, SaaS products, or any Node.js application. See the [Embed in Your Product](/guide/embed) guide for Express, Next.js, background job, and Slack examples.

## What's Next

- [Embed in Your Product](/guide/embed) — library integration patterns (Express, Next.js, queues)
- [Configuration](/guide/configuration) — understand `golem.yaml` and `${ENV_VAR}` placeholders
- [CLI Commands](/guide/cli-commands) — full command reference
- [Engines](/engines/overview) — compare Cursor, Claude Code, OpenCode, and Codex
- [Skills](/skills/overview) — extend your assistant's capabilities
