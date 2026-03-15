# 内置技能

GolemBot 自带四个内置技能，在 `golembot init` 或 `golembot onboard` 时自动复制到新助手目录。

## `general` — 通用个人助手

通用技能，使 Agent 成为个人 AI 助手。

**能力：**
- 回答问题、提供建议、头脑风暴
- 读写文件：整理笔记、生成报告、管理待办
- 执行脚本和命令进行任务自动化
- 信息检索和摘要

**持久记忆：** 建立 `notes.md` 规范，用于跨会话记忆——Agent 在对话开始时读取，在获取重要信息时写入。详见[记忆系统](/zh/guide/memory)。

**技能管理：** Agent 可以从 ClawHub 自主搜索和安装社区技能。当用户需要 agent 没有的能力时，它会主动搜索 ClawHub 并建议安装。所有命令支持 `--json` 输出。

## `im-adapter` — IM 回复规范

优化 Agent 在即时通讯平台（飞书、钉钉、企业微信、Slack、Telegram、Discord）上的回复。

- 简单问题 1–2 句，复杂问题分段每段不超过 300 字符
- 使用标准 Markdown 语法 — 自动转换为各 IM 平台的原生格式
- 使用 `## 标题` 分节、`**加粗**` 强调、`- 列表` 和 `` `代码` ``
- 群聊中称呼用户名、必要时 @mention
- 不以「好的，让我来帮你...」开头

## `multi-bot` — 多 Bot 协作

支持同一 Fleet（同一台机器）上运行的多个 GolemBot 实例之间的协调。

**能力：**
- **同伴感知**：Agent 通过群聊 prompt 中注入的 `[Peers: BotName (role)]` 看到 Fleet 中的其他 Bot
- **领域分工**：有同伴时，Agent 聚焦自身专长领域，将不擅长的问题引导给合适的同伴
- **跨 Bot API 调用**：Agent 可通过同伴 Bot 的 HTTP API（`POST /chat`）委派任务
- **自动发现**：同伴通过 `~/.golembot/fleet/` 自动发现——无需手动配置

**群聊中的协作行为：**

| 群聊策略 | 有同伴时的行为 |
|----------|-------------|
| `mention-only` | 被 @mention 时回复；轻量引导建议将非本领域问题交给同伴 |
| `smart` | 完整 `[PASS]` 协调——当同伴更适合回答时，Agent 主动沉默 |
| `always` | 每条消息都回复；同伴感知的轻量引导 |

**配置：** 此技能在 `golembot init` 时自动安装。要实现有效的多 Bot 协作，请为每个 Bot 设置 `persona.role`（通过 `golembot init --role "..."` 或在 `golem.yaml` 中配置）。角色会传播到 Fleet 注册，让同伴看到彼此的专长。

## `message-push` — 主动消息推送

支持 Agent 主动向 IM 群聊或用户发送消息——无需等待用户消息触发。

**能力：**
- **群消息**：向 Bot 所在的任意群发送消息
- **私聊消息**：向与 Bot 有过互动的用户发送私信
- **通道发现**：通过 `GET /api/channels` 查询可用通道
- **意图识别**：识别"把这个发到运营群"、"告诉 Alice..."等推送意图

**API 端点：**

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/send` | 向指定通道 + chatId 发送消息 |
| `GET` | `/api/channels` | 列出可用通道及其发送能力 |

**示例：**
```bash
curl -X POST http://localhost:3000/api/send \
  -H "Content-Type: application/json" \
  -d '{"channel": "feishu", "chatId": "oc_xxx", "text": "会议改到下午 3 点"}'
```

## 模板技能

[引导向导](/zh/guide/onboard-wizard)提供 6 个场景模板，各含一个专用技能：

| 模板 | 技能 | 核心行为 |
|------|------|----------|
| `customer-support` | `faq-support` | FAQ 查询，未解答升级到 `unanswered.md` |
| `data-analyst` | `data-analysis` | 从 `data/` 读取，输出到 `reports/`，使用 `calc.py` |
| `code-reviewer` | `code-review` | 5 维度审查，严重级别分层，输出到 `reviews/` |
| `ops-assistant` | `ops` | 内容创作、排期管理、竞品追踪 |
| `meeting-notes` | `meeting` | 结构化纪要，行动项到 `action-items.md` |
| `research` | `research` | 研究报告，来源到 `sources.md` |
