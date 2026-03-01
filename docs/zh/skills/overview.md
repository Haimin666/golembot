# 技能概览

**Skill（技能）**是 GolemBot 中的能力单元。它是一个目录，包含指令和可选的辅助文件，教 Coding Agent 如何执行特定任务。

## 目录结构

```
skills/
├── general/              # 内置：通用助手
│   └── SKILL.md
├── im-adapter/           # 内置：IM 回复规范
│   └── SKILL.md
└── my-custom-skill/      # 你自定义的技能
    ├── SKILL.md          # 必需：指令 + 元数据
    ├── analyze.py        # 可选：辅助脚本
    └── reference.md      # 可选：知识文档
```

## 工作原理

1. 每次 `assistant.chat()` 调用时，GolemBot 扫描 `skills/` 目录
2. 每个包含 `SKILL.md` 的子目录注册为一个技能
3. 技能通过符号链接注入引擎预期位置
4. Coding Agent 读取技能指令并获得描述的能力

## SKILL.md 格式

每个 `SKILL.md` 必须有 YAML frontmatter，至少包含 `name` 和 `description`：

```markdown
---
name: my-skill
description: 这个技能做什么的简要说明
---

# 技能标题

给 Coding Agent 的使用指令。
```

## 核心原则

- **不在配置中声明** — `skills/` 目录是唯一的事实来源
- **没有独立的 Tool 概念** — 脚本放在技能目录里，`SKILL.md` 描述如何调用
- **即放即用** — 复制目录即添加技能；删除目录即移除技能
- **引擎无关** — 同一个 Skill 在 Cursor、Claude Code 和 OpenCode 上都能用
