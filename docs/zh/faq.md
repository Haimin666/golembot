# FAQ

## 应该选哪个引擎？

- **Cursor** — 如果你已经在用 Cursor IDE 并有订阅
- **Claude Code** — 综合体验最佳；提供费用追踪和轮次统计
- **OpenCode** — 需要多 Provider 灵活性（Anthropic、OpenAI、OpenRouter 等）
- **Codex** — 偏好 OpenAI 模型；支持 ChatGPT OAuth 或 API Key

四者产出相同的 `StreamEvent` 接口，随时可以切换。

## 如何设置 API Key？

| 引擎 | 环境变量 |
|------|----------|
| Cursor | `CURSOR_API_KEY` |
| Claude Code | `ANTHROPIC_API_KEY` |
| OpenCode | 取决于 Provider（如 `ANTHROPIC_API_KEY`、`OPENAI_API_KEY`） |
| Codex | `CODEX_API_KEY`（或 `codex login` 使用 ChatGPT OAuth） |

放在助手目录的 `.env` 文件中 — CLI 启动时自动加载。

## 会话管理如何工作？

- 每个 `sessionKey` 映射到一个独立的引擎会话
- 会话存储在 `.golem/sessions.json`
- 默认会话 Key 是 `"default"`
- 通过引擎原生的 `--resume` / `--session` 参数自动恢复会话
- 恢复失败时自动开始新会话
- 使用 `/reset`（CLI）或 `assistant.resetSession()` 手动清除

## 多用户可以共享一个助手吗？

可以。使用不同的 `sessionKey`：

```typescript
assistant.chat('你好', { sessionKey: 'user-alice' });
assistant.chat('你好', { sessionKey: 'user-bob' });
```

相同 Key 串行执行；不同 Key 并行执行。Gateway 自动为 IM 通道处理此逻辑。

## 可以不用 CLI 吗？

可以。GolemBot 的核心是一个可导入的 TypeScript 库：

```typescript
import { createAssistant } from 'golembot';
const assistant = createAssistant({ dir: './my-bot' });
```

CLI 只是这个库的一个消费者。

## 为什么 `CLAUDE.md` 是 `AGENTS.md` 的符号链接？

Claude Code 读取 `CLAUDE.md` 获取项目级指令。GolemBot 生成 `AGENTS.md`（列出技能、规范），并将 `CLAUDE.md` 符号链接到它。两个文件始终保持同步。

## 飞书/钉钉/企业微信可以在 NAT 后运行吗？

可以。三者都使用出站 WebSocket 连接 — 无需公网 IP 或端口转发。

## 如何检查配置是否正确？

```bash
golembot doctor
```

检查 Node.js 版本、`golem.yaml`、引擎二进制、API Key 和技能。
