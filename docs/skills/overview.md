# Skills Overview

A **Skill** is the unit of capability in GolemBot. It's a directory containing instructions and optional supporting files that teach the Coding Agent how to perform a specific task.

## Structure

```
skills/
├── general/              # Built-in: general assistant
│   └── SKILL.md
├── im-adapter/           # Built-in: IM response conventions
│   └── SKILL.md
├── multi-bot/            # Built-in: multi-bot collaboration
│   └── SKILL.md
├── message-push/         # Built-in: proactive message sending
│   └── SKILL.md
└── my-custom-skill/      # Your own skill
    ├── SKILL.md          # Required: instructions + metadata
    ├── analyze.py        # Optional: supporting scripts
    └── reference.md      # Optional: knowledge documents
```

## How Skills Work

1. On each `assistant.chat()` call, GolemBot scans the `skills/` directory
2. Each subdirectory with a `SKILL.md` file is registered as a skill
3. Skills are injected into the engine's expected location (symlinks):
   - Cursor: `.cursor/skills/`
   - Claude Code: `.claude/skills/`
   - OpenCode: `.opencode/skills/`
   - Codex: `.agents/skills/`
4. The Coding Agent reads the skill instructions and gains the described capabilities

## Community Skill Registries

GolemBot's `SKILL.md` format is 100% compatible with OpenClaw's ClawHub ecosystem.

GolemBot integrates with multiple community skill registries. Search and install skills directly from the CLI:

- **[ClawHub](https://clawhub.ai)** — the largest community skill marketplace with 13,000+ skills (default registry)
- **[skills.sh](https://skills.sh)** — a community-driven skill registry with curated, high-quality skills

```bash
# Search for skills (defaults to ClawHub)
golembot skill search "data analysis"

# Search a specific registry
golembot skill search "data analysis" --registry skills.sh

# Install from ClawHub
golembot skill add clawhub:data-analysis

# Install from skills.sh
golembot skill add skills.sh:owner/repo/skill

# All skill commands support --json for agent-friendly output
golembot skill search "markdown" --json
```

The pluggable registry interface makes it easy to add new skill sources. Currently supported: `clawhub` (default), `skills.sh`.

### Agent-Powered Skill Discovery

::: tip Agent-Friendly
All skill commands support `--json` output. The built-in `general` skill teaches the agent to search and install skills autonomously — when a user asks for capabilities the agent doesn't have, it can proactively search registries and suggest installing relevant skills.
:::

## SKILL.md Format

Every `SKILL.md` must have YAML frontmatter with at least a `name` and `description`:

```markdown
---
name: my-skill
description: Brief description of what this skill does
---

# Skill Title

Instructions for the Coding Agent on how to use this skill.

## What This Skill Does

- Capability 1
- Capability 2

## How to Use

Detailed instructions, conventions, and constraints.
```

The `name` and `description` from the frontmatter are used in `AGENTS.md` (auto-generated) and in `golembot skill list` output.

## Key Principles

- **No config declaration** — the `skills/` directory is the single source of truth. Whatever is in it, the assistant has those capabilities.
- **No separate Tool concept** — scripts live inside the Skill directory, and `SKILL.md` describes how to invoke them. Coding Agents can natively execute any script.
- **Drop in, drop out** — add a skill by copying a directory in; remove it by deleting the directory.
- **Engine-agnostic** — the same Skill works across Cursor, Claude Code, OpenCode, and Codex.

## Managing Skills

```bash
# List installed skills
golembot skill list

# Add a skill from a local path
golembot skill add /path/to/my-skill

# Remove a skill
golembot skill remove my-skill
```

Or simply copy/delete directories manually — no CLI required.

## What's Next

- [Create a Skill](/skills/create-skill) — write your own skill from scratch
- [Built-in Skills](/skills/builtin) — what `general` and `im-adapter` do
- [ClawHub](https://clawhub.ai) — browse 13,000+ community skills
- [skills.sh](https://skills.sh) — curated community skill registry

