# 创建技能

本指南介绍如何为 GolemBot 助手创建自定义技能。

## 最小技能

在 `skills/` 下创建一个包含 `SKILL.md` 的目录：

```markdown
---
name: weather
description: 使用 wttr.in 查询天气预报
---

# 天气技能

当用户询问天气时，使用以下命令获取数据：

\`\`\`bash
curl -s "wttr.in/{city}?format=3"
\`\`\`

将 `{city}` 替换为请求的城市。用口语化的方式报告结果。
```

就这样。下次 `assistant.chat()` 运行时，Agent 就知道如何查天气了。

## 带脚本的技能

```
skills/
└── data-report/
    ├── SKILL.md
    ├── analyze.py
    └── template.md
```

在 `SKILL.md` 中描述如何调用脚本。Coding Agent 可以原生执行 Python、Node.js、Bash 或任何脚本 — 无需框架注册。

## SKILL.md 最佳实践

1. **清晰的 frontmatter** — 始终包含 `name` 和 `description`
2. **具体明确** — 告诉 Agent 确切要做什么、文件在哪、用什么格式
3. **包含约束** — Agent 不应该做什么
4. **引用路径** — 使用相对于助手根目录的路径
5. **保持聚焦** — 一个技能 = 一个能力领域

## 添加技能

```bash
# 通过 CLI
golembot skill add /path/to/my-skill

# 或手动复制
cp -r ~/my-skills/weather skills/weather

# 验证
golembot skill list
```

## 移除技能

```bash
golembot skill remove weather
# 或直接删除目录
rm -rf skills/weather
```
