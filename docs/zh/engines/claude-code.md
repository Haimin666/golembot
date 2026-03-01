# Claude Code 引擎

Claude Code 引擎调用 Anthropic 的 `claude` CLI。

## 前置条件

- 安装 Claude Code：`~/.local/bin/claude` 或在 PATH 中可用
- 认证：`claude auth login` 或设置 `ANTHROPIC_API_KEY` 环境变量

## 配置

```yaml
name: my-bot
engine: claude-code
model: claude-sonnet    # 可选
skipPermissions: true   # 默认：true
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
