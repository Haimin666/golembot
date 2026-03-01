# CLI Commands

GolemBot provides a set of CLI commands for managing and running your assistant.

## `golembot init`

Initialize a new assistant directory.

```bash
golembot init [-e <engine>] [-n <name>]
```

| Option | Description | Default |
|--------|-------------|---------|
| `-e, --engine <engine>` | Engine type (`cursor`, `claude-code`, `opencode`) | `cursor` |
| `-n, --name <name>` | Assistant name | Interactive prompt |

Creates `golem.yaml`, `skills/` (with built-in skills), `AGENTS.md`, `.golem/`, and `.gitignore`.

## `golembot run`

Start an interactive REPL conversation.

```bash
golembot run [-d <dir>] [--api-key <key>]
```

| Option | Description | Default |
|--------|-------------|---------|
| `-d, --dir <dir>` | Assistant directory | `.` |
| `--api-key <key>` | Agent API key | From env |

**REPL slash commands:**

| Command | Description |
|---------|-------------|
| `/help` | Show available commands |
| `/reset` | Clear current session |
| `/quit`, `/exit` | Exit the REPL |

Supports multi-line input with `"""` delimiters. Displays duration and cost (when available) on completion.

## `golembot serve`

Start the HTTP SSE server.

```bash
golembot serve [-d <dir>] [-p <port>] [-t <token>] [--host <host>] [--api-key <key>]
```

| Option | Description | Default |
|--------|-------------|---------|
| `-d, --dir <dir>` | Assistant directory | `.` |
| `-p, --port <port>` | HTTP port | `3000` |
| `-t, --token <token>` | Bearer auth token | `GOLEM_TOKEN` env |
| `--host <host>` | Bind address | `127.0.0.1` |
| `--api-key <key>` | Agent API key | From env |

See [HTTP API](/api/http-api) for endpoint details.

## `golembot gateway`

Start the IM + HTTP unified gateway service.

```bash
golembot gateway [-d <dir>] [-p <port>] [-t <token>] [--host <host>] [--api-key <key>] [--verbose]
```

| Option | Description | Default |
|--------|-------------|---------|
| `-d, --dir <dir>` | Assistant directory | `.` |
| `-p, --port <port>` | HTTP port | `3000` |
| `-t, --token <token>` | Bearer auth token | `GOLEM_TOKEN` env |
| `--host <host>` | Bind address | `127.0.0.1` |
| `--api-key <key>` | Agent API key | From env |
| `--verbose` | Enable channel log output | `false` |

Reads `channels` config from `golem.yaml` and starts the corresponding IM adapters alongside the HTTP service.

## `golembot onboard`

Run the interactive setup wizard.

```bash
golembot onboard [-d <dir>] [--template <name>]
```

| Option | Description | Default |
|--------|-------------|---------|
| `-d, --dir <dir>` | Working directory | `.` |
| `--template <name>` | Scenario template to use | Interactive prompt |

See [Onboard Wizard](/guide/onboard-wizard) for the full walkthrough.

## `golembot status`

Display the current assistant configuration.

```bash
golembot status [-d <dir>]
```

Shows: name, engine, model, installed skills, configured channels, and gateway settings.

## `golembot skill`

Manage skills in the assistant directory.

### `golembot skill list`

```bash
golembot skill list [-d <dir>]
```

Lists all installed skills with their descriptions.

### `golembot skill add <source>`

```bash
golembot skill add <source> [-d <dir>]
```

Copies a skill directory from `<source>` into the assistant's `skills/` folder. The source must contain a `SKILL.md` file.

### `golembot skill remove <name>`

```bash
golembot skill remove <name> [-d <dir>]
```

Removes a skill by its directory name.

## `golembot doctor`

Run prerequisite checks.

```bash
golembot doctor [-d <dir>]
```

Checks:
- Node.js version (>= 18)
- `golem.yaml` exists and is valid
- Engine CLI binary is on PATH
- API key environment variable is set
- Skills directory contains valid skills

## Environment Variables

| Variable | Used By | Description |
|----------|---------|-------------|
| `CURSOR_API_KEY` | Cursor engine | Cursor API key |
| `ANTHROPIC_API_KEY` | Claude Code engine | Anthropic API key |
| `OPENAI_API_KEY` | OpenCode engine | OpenAI API key |
| `OPENROUTER_API_KEY` | OpenCode engine | OpenRouter API key |
| `GOLEM_TOKEN` | serve / gateway | HTTP bearer auth token |
| `GOLEM_PORT` | serve / gateway | HTTP port override |

The CLI auto-loads a `.env` file from the working directory at startup.
