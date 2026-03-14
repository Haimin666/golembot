# Claude Code 引擎

Claude Code 引擎调用 Anthropic 的 `claude` CLI。

## 前置条件

- 安装 Claude Code：`~/.local/bin/claude` 或在 PATH 中可用
- 认证：`claude auth login` 或设置 `ANTHROPIC_API_KEY` 环境变量

## 配置

```yaml
name: my-bot
engine: claude-code
model: claude-sonnet-4-6   # 可选，见下方说明
skipPermissions: true       # 默认：true
```

## 选择模型

模型名称为 Anthropic model ID，直接通过 `--model` 传给 `claude` CLI。

**列出可用模型：**

```bash
claude models
```

**最新模型：**

| Model ID | 别名 | 说明 |
|----------|------|------|
| `claude-opus-4-6` | `claude-opus-4-6` | 最强推理能力，适合复杂任务 |
| `claude-sonnet-4-6` | `claude-sonnet-4-6` | 速度与能力均衡，推荐默认 |
| `claude-haiku-4-5-20251001` | `claude-haiku-4-5` | 最快，轻量 |

完整列表及最新信息见 [Anthropic 模型文档](https://docs.anthropic.com/en/docs/about-claude/models)。

**运行时覆盖** — 通过 `createAssistant()` 传入：

```typescript
const bot = createAssistant({ dir: './my-bot', model: 'claude-opus-4-6' })
```

## 工作原理

### 权限跳过

`skipPermissions` 默认为 `true`。启用时会传递 `--dangerously-skip-permissions` 给 CLI。首次使用时会在 stderr 输出一次警告。在 `golem.yaml` 中设置 `skipPermissions: false` 可禁用此行为。

### 技能注入

技能通过符号链接注入到 `.claude/skills/`。同时创建 `CLAUDE.md` → `AGENTS.md` 的符号链接，让 Claude Code 读取自动生成的助手上下文。

### 费用和轮次追踪

Claude Code 是唯一在 `done` 事件中提供每次对话费用和轮次数的引擎：

```typescript
{ type: 'done', sessionId: '...', durationMs: 12345,
  costUsd: 0.042, numTurns: 3 }
```

### 环境处理

GolemBot 在启动前会删除 `CLAUDECODE` 和 `CLAUDE_CODE_ENTRYPOINT` 环境变量，以允许嵌套调用 Claude Code。

## Claude Max 订阅

如果你有 Claude Pro 或 Max 订阅（而非 API key），可以用 `claude setup-token` 生成长期 OAuth token，用于 GolemBot Gateway 等无头环境。

### 配置步骤

1. 在有浏览器的机器上运行：
   ```bash
   claude setup-token
   ```
2. 复制生成的 token（有效期 1 年）。
3. 添加到 `.env`：
   ```sh
   CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-xxxx...
   ```
4. 在 `golem.yaml` 中引用：
   ```yaml
   name: my-bot
   engine: claude-code
   oauthToken: ${CLAUDE_CODE_OAUTH_TOKEN}
   ```

### 工作原理

- GolemBot 通过 `CLAUDE_CODE_OAUTH_TOKEN` 环境变量将 token 注入 Claude Code CLI。
- `oauthToken` 优先于 `ANTHROPIC_API_KEY`——两者互斥。
- 每个 GolemBot 实例可以使用独立的 token（互不干扰）。

### 过期监控

- GolemBot 跟踪 token 首次使用时间，估算过期日（首次使用 + 365 天）。
- **预计过期前 30 天**，每次对话会 emit `warning` StreamEvent——IM 通道会自动转发给管理员。
- 认证失败时，GolemBot 会 emit 警告提示重新运行 `claude setup-token`。
- `golembot doctor` 检查 token 状态和预计过期时间。

::: tip
同一账号可以生成多个 setup-token。在别处登录或生成新 token **不会**使已有 token 失效。手动撤销请前往 [claude.ai/settings/claude-code](https://claude.ai/settings/claude-code)。
:::
