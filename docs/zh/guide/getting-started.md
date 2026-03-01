# 快速开始

## 前置条件

- **Node.js** >= 18
- 安装一个 Coding Agent CLI：
  - [Cursor](https://docs.cursor.com/agent)（`agent` CLI）
  - [Claude Code](https://docs.anthropic.com/en/docs/claude-code)（`claude` CLI）
  - [OpenCode](https://github.com/opencode-ai/opencode)（`opencode` CLI）

## 安装

```bash
npm install -g golembot
```

或使用 pnpm / yarn：

```bash
pnpm add -g golembot
# 或
yarn global add golembot
```

## 快速上手

### 方式 A：引导式设置（推荐）

```bash
mkdir my-bot && cd my-bot
golembot onboard
```

[引导向导](/zh/guide/onboard-wizard)会带你完成引擎选择、命名、IM 通道配置和场景模板选择，共 7 个交互步骤。

### 方式 B：手动初始化

```bash
mkdir my-bot && cd my-bot
golembot init -e claude-code -n my-bot
```

这会创建：
- `golem.yaml` — 助手配置文件
- `skills/` — 技能目录，包含内置技能（`general` + `im-adapter`）
- `AGENTS.md` — 为 Coding Agent 自动生成的上下文文档
- `.golem/` — 内部状态目录（gitignore）

### 开始对话

```bash
golembot run
```

这会打开交互式 REPL。输入消息按回车即可。Coding Agent 负责一切 — 读写文件、运行脚本、多步推理。

**REPL 命令：**
- `/help` — 显示可用命令
- `/reset` — 清除当前会话
- `/quit` 或 `/exit` — 退出

### 启动 Gateway 服务

```bash
golembot gateway
```

这会同时启动 HTTP API 和已配置的 IM 通道适配器。IM 配置详见[通道](/zh/channels/overview)。

## 作为库使用

GolemBot 的核心是一个可导入的 TypeScript 库：

```typescript
import { createAssistant } from 'golembot';

const assistant = createAssistant({ dir: './my-bot' });

for await (const event of assistant.chat('分析销售数据')) {
  if (event.type === 'text') process.stdout.write(event.content);
}
```

这种模式适用于嵌入 Slack 机器人、内部工具、SaaS 产品或任何 Node.js 应用。详见 [API 参考](/zh/api/create-assistant)。

## 下一步

- [配置说明](/zh/guide/configuration) — 了解 `golem.yaml` 和 `${ENV_VAR}` 占位符
- [CLI 命令](/zh/guide/cli-commands) — 完整命令参考
- [引擎](/zh/engines/overview) — 对比 Cursor、Claude Code 和 OpenCode
- [技能](/zh/skills/overview) — 扩展助手能力
