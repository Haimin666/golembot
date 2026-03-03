# Onboard Wizard

The `golembot onboard` command provides a 7-step interactive wizard for setting up a new assistant from scratch.

## Usage

```bash
mkdir my-bot && cd my-bot
golembot onboard
```

Or skip interactivity with the `--template` flag:

```bash
golembot onboard --template customer-support
```

## The 7 Steps

### Step 1: Select Engine

Choose your Coding Agent backend:

- **cursor** — Cursor's `agent` CLI
- **claude-code** — Anthropic's `claude` CLI
- **opencode** — OpenCode CLI (multi-provider support)
- **codex** — OpenAI Codex CLI

### Step 2: Name Your Assistant

Give your assistant a descriptive name (e.g., `sales-analyst`, `team-helper`).

### Step 3: Select IM Channels

Multi-select which IM platforms to connect (optional):

- Feishu (Lark)
- DingTalk
- WeCom (WeChat Work)

> **Note**: Slack, Telegram, and Discord are not offered by the wizard (they require additional setup steps best done manually). After the wizard completes, add them to `golem.yaml` — see the [channel docs](/channels/overview) for each platform's configuration.

### Steps 4–5: Configure Channel Credentials

For each selected channel, the wizard prompts for the required credentials:

- **Feishu**: App ID + App Secret
- **DingTalk**: Client ID + Client Secret
- **WeCom**: Corp ID + Agent ID + Secret + Token + Encoding AES Key

All credentials are stored in `.env` with `${ENV_VAR}` references in `golem.yaml`.

### Step 6: Choose a Scenario Template

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

### Step 7: Generate & Launch

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
