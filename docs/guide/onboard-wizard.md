# Onboard Wizard

The `golembot onboard` command provides an 8-step interactive wizard for setting up a new assistant from scratch.

## Usage

```bash
mkdir my-bot && cd my-bot
golembot onboard
```

Or skip interactivity with the `--template` flag:

```bash
golembot onboard --template customer-support
```

## The 8 Steps

### Step 1: Select Engine

Choose your Coding Agent backend:

- **cursor** — Cursor's `agent` CLI
- **claude-code** — Anthropic's `claude` CLI
- **opencode** — OpenCode CLI (multi-provider support)
- **codex** — OpenAI Codex CLI

### Step 2: Engine Authentication

The wizard checks whether the selected engine is already authenticated (via environment variable or CLI login). If not, you can:

- **Enter an API key** — saved to `.env` automatically
- **Confirm CLI login** — for engines that support browser-based OAuth (`claude auth login`, `codex login`, `agent login`)
- **Skip** — configure later (the wizard will remind you)

| Engine | API Key | CLI Login |
|--------|---------|-----------|
| Cursor | `CURSOR_API_KEY` | `agent login` |
| Claude Code | `ANTHROPIC_API_KEY` | `claude auth login` |
| OpenCode | Depends on provider | — |
| Codex | `CODEX_API_KEY` | `codex login` |

### Step 3: Name Your Assistant

Give your assistant a descriptive name (e.g., `sales-analyst`, `team-helper`).

### Step 4: Select IM Channels

Multi-select which IM platforms to connect (optional). All 6 platforms are supported:

- **Feishu (Lark)** — WebSocket, no public IP needed
- **DingTalk** — Stream mode, no public IP needed
- **WeCom (WeChat Work)** — WebSocket, no public IP needed
- **Slack** — Socket Mode, no public IP needed
- **Telegram** — Polling, no public IP needed
- **Discord** — Gateway API, no public IP needed

### Steps 5–6: Configure Channel Credentials

For each selected channel, the wizard prompts for the required credentials:

- **Feishu**: App ID + App Secret
- **DingTalk**: Client ID + Client Secret
- **WeCom**: Corp ID + Agent ID + Secret + Token + Encoding AES Key
- **Slack**: Bot Token + App-Level Token
- **Telegram**: Bot Token
- **Discord**: Bot Token

All credentials are stored in `.env` with `${ENV_VAR}` references in `golem.yaml`.

### Step 7: Choose a Scenario Template

Select from 6 pre-built templates, or choose **None** to skip:

| Template | Description |
|----------|-------------|
| `customer-support` | FAQ-based support with escalation tracking |
| `data-analyst` | Data analysis with reports and calculations |
| `code-reviewer` | 5-dimension code review with severity tiers |
| `ops-assistant` | Content operations, scheduling, competitor tracking |
| `meeting-notes` | Structured minutes with action item tracking |
| `research` | Structured research reports with source management |
| *(None)* | Skip — use built-in skills only |

Templates are **optional**. Selecting "None" skips template installation; the assistant still gets the `general` and `im-adapter` built-in skills and is fully functional.

If no template fits your scenario, skip here and create a custom skill later — add a directory under `skills/` with a `SKILL.md` file. See [Create a Skill](/skills/create-skill).

Each template includes a tailored `golem.yaml`, skill directory, and supporting files.

### Step 8: Generate & Launch

The wizard generates:

- `golem.yaml` — assistant configuration
- `.env` — environment variables (credentials)
- `.env.example` — template for sharing
- `.gitignore` — excludes `.golem/` and `.env`
- `skills/` — built-in skills + template skill
- `AGENTS.md` — auto-generated agent context

Optionally starts the gateway immediately.

## Options

| Option | Description |
|--------|-------------|
| `-d, --dir <dir>` | Working directory (default: `.`) |
| `--template <name>` | Skip template selection step |
