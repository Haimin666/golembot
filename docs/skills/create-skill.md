# Create a Skill

This guide walks through creating a custom skill for your GolemBot assistant.

## Minimal Skill

Create a directory under `skills/` with a `SKILL.md` file:

```
skills/
└── weather/
    └── SKILL.md
```

```markdown
---
name: weather
description: Check weather forecasts using wttr.in
---

# Weather Skill

When the user asks about weather, use the following command to fetch data:

\`\`\`bash
curl -s "wttr.in/{city}?format=3"
\`\`\`

Replace `{city}` with the requested location. Report the result in a conversational tone.
```

That's it. The next time `assistant.chat()` runs, the agent will know how to check weather.

## Skill with Scripts

For more complex capabilities, include scripts alongside `SKILL.md`:

```
skills/
└── data-report/
    ├── SKILL.md
    ├── analyze.py
    └── template.md
```

```markdown
---
name: data-report
description: Generate data analysis reports from CSV files
---

# Data Report Skill

## How to Use

1. Look for CSV files in the `data/` directory
2. Run `python skills/data-report/analyze.py <file>` to process
3. Use `skills/data-report/template.md` as the report format
4. Save output to `reports/YYYY-MM-DD-<topic>.md`

## Conventions

- Always include a summary section at the top
- Include source file name and row count
- Use tables for numerical data
```

The Coding Agent can natively execute Python, Node.js, Bash, or any other script — no framework registration needed.

## Skill with Knowledge Documents

Bundle reference material for the agent:

```
skills/
└── brand-voice/
    ├── SKILL.md
    ├── tone-guide.md
    └── examples/
        ├── good.md
        └── bad.md
```

Reference the files in `SKILL.md` with relative paths. The agent can read them as needed.

## SKILL.md Best Practices

1. **Clear frontmatter** — always include `name` and `description`
2. **Be specific** — tell the agent exactly what to do, where files are, what format to use
3. **Include constraints** — what the agent should NOT do
4. **Reference paths** — use relative paths from the assistant root for scripts and data
5. **Keep it focused** — one skill = one capability area. Split broad skills into multiple focused ones.

## Adding the Skill

### Via CLI

```bash
golembot skill add /path/to/my-skill
```

This copies the skill directory into `skills/`.

### Manually

Just copy or symlink the directory:

```bash
cp -r ~/my-skills/weather skills/weather
```

### Verify

```bash
golembot skill list
```

The new skill should appear with its name and description.

## Removing a Skill

```bash
golembot skill remove weather
```

Or simply delete the directory:

```bash
rm -rf skills/weather
```
