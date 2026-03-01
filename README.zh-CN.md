[English](README.md) | [中文](README.zh-CN.md)

# GolemBot — 本地优先的 AI 助手平台

[![CI](https://github.com/0xranx/golembot/actions/workflows/ci.yml/badge.svg)](https://github.com/0xranx/golembot/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/golembot.svg)](https://www.npmjs.com/package/golembot)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org/)

> **Coding Agent = 灵魂，GolemBot = 泥土之躯。**
>
> 用你已有的 Coding Agent（Cursor / Claude Code / OpenCode）作为大脑——让它们不止能聊天，还能真正把事情做完。

GolemBot 是一个 TypeScript 库 + CLI，将 Coding Agent CLI 封装为统一的 AI 助手引擎。一条命令即可启动一个连接飞书、钉钉或企业微信的智能助手——本地运行、完全透明、引擎可换。

## 特性

- **三大引擎** — Cursor / Claude Code / OpenCode，一行配置切换
- **内置 IM 通道** — 原生适配飞书、钉钉和企业微信，无需写代码
- **库优先** — `createAssistant()` API 可嵌入任何 Node.js 项目
- **目录即助手** — `ls` 一下就能看到助手知道什么、能做什么、做过什么
- **Skill = 能力** — 把 Markdown + 脚本放进 `skills/` 目录，助手自动获得新能力
- **多用户隔离** — 按 sessionKey 路由，每个用户拥有独立会话
- **HTTP 服务** — 内置 SSE 流式 API，支持 Bearer token 认证
- **Docker 部署** — 一键部署到云端

## 快速开始

```bash
# 安装
npm install -g golembot

# 引导式安装（推荐）
mkdir my-assistant && cd my-assistant
golembot onboard

# 或手动初始化
golembot init

# 启动网关（IM 通道 + HTTP 服务）
golembot gateway
```

30 秒体验：

```bash
mkdir my-bot && cd my-bot
golembot init -e claude-code -n my-bot
golembot run
# > 写一个 Python 脚本来统计当前目录下的文件大小
```

## 架构

```
飞书 / 钉钉 / 企业微信 / HTTP API
         │
         ▼
┌─────────────────────────┐
│      Gateway 服务        │
│  (通道适配器 +           │
│   HTTP 服务)             │
└────────────┬────────────┘
             │
     createAssistant()
             │
     ┌───────┼───────┐
     ▼       ▼       ▼
  Cursor  Claude   OpenCode
          Code
```

核心设计：Gateway 是一个长驻服务，内部复用 `createAssistant()` 库 API，上层叠加 IM 通道适配层。

## 引擎对比

| | Cursor | Claude Code | OpenCode |
|---|---|---|---|
| 启动方式 | child_process.spawn | child_process.spawn | child_process.spawn |
| Skill 注入 | `.cursor/skills/` | `.claude/skills/` + CLAUDE.md | `.opencode/skills/` + opencode.json |
| 会话恢复 | `--resume` | `--resume` | `--session` |
| API Key | CURSOR_API_KEY | ANTHROPIC_API_KEY | 取决于 Provider |

所有引擎暴露的 `StreamEvent` 接口完全一致——切换引擎无需修改任何应用代码。

## 使用方式

### 方式一：CLI（最快上手）

```bash
golembot init         # 初始化助手
golembot run          # REPL 对话
golembot gateway      # 启动 IM + HTTP 服务
golembot onboard      # 引导式安装
```

### 方式二：库导入

```typescript
import { createAssistant } from 'golembot';

const assistant = createAssistant({ dir: './my-agent' });

for await (const event of assistant.chat('分析竞品数据')) {
  if (event.type === 'text') process.stdout.write(event.content);
}
```

### 方式三：嵌入到任何地方

```typescript
import { createAssistant } from 'golembot';
const bot = createAssistant({ dir: './slack-bot' });

slackApp.message(async ({ message, say }) => {
  let reply = '';
  for await (const event of bot.chat(message.text, {
    sessionKey: `slack:${message.user}`,
  })) {
    if (event.type === 'text') reply += event.content;
  }
  await say(reply);
});
```

## 配置

`golem.yaml` — 助手的唯一配置文件：

```yaml
name: my-assistant
engine: claude-code
model: openrouter/anthropic/claude-sonnet-4

channels:
  feishu:
    appId: ${FEISHU_APP_ID}
    appSecret: ${FEISHU_APP_SECRET}
  dingtalk:
    clientId: ${DINGTALK_CLIENT_ID}
    clientSecret: ${DINGTALK_CLIENT_SECRET}

gateway:
  port: 3000
  token: ${GOLEM_TOKEN}
```

敏感字段支持 `${ENV_VAR}` 引用环境变量。

## Skill 系统

Skill 是助手能力的单元——一个包含 `SKILL.md`（知识与指令）和可选辅助文件（脚本、模板等）的目录。

```
skills/
├── general/          # 通用助手（内置）
│   └── SKILL.md
├── im-adapter/       # IM 回复规范（内置）
│   └── SKILL.md
└── my-custom-skill/  # 你自己的 Skill
    ├── SKILL.md
    └── analyze.py
```

想添加能力？把文件夹放进 `skills/`。想移除？删掉文件夹。`ls skills/` 就是助手能力的完整清单。

## Docker 部署

```bash
# 在助手目录下
docker compose up -d
```

或使用 Dockerfile：

```dockerfile
FROM node:22-slim
RUN npm install -g golembot
WORKDIR /assistant
COPY . .
EXPOSE 3000
CMD ["golembot", "gateway"]
```

## 开发

```bash
git clone https://github.com/0xranx/golembot.git
cd golembot
pnpm install
pnpm run build
pnpm run test          # 单元测试
pnpm run e2e:opencode  # 端到端测试（需要 API Key）
```

## 许可证

[MIT](LICENSE)
