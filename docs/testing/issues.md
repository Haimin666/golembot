# IM Playbook Testing — Issues Log

## Issue 1 · Cross-engine session ID contamination causes opencode hang

**发现时间**: 2026-03-03
**测试阶段**: Telegram A-1 DM Basic Flow
**严重级别**: High

### 现象
切换引擎（`claude-code` → `opencode`）后，`.golem/sessions.json` 里残留了旧引擎的 session ID（UUID 格式，如 `0c6342a4-7270-4300-90bb-b86b0a407fde`）。下次调用 opencode 时，框架把这个 ID 传给 `opencode --session <id>`，opencode 找不到对应 session，进程卡住不返回，既不报错也不超时（在 5 分钟观察窗口内）。

### 复现步骤
1. 用 `engine: claude-code` 启动 gateway 并发几条消息（产生 session 记录）
2. 改为 `engine: opencode`，不清除 `.golem/sessions.json`
3. 发送新消息 → gateway 显示 "received" 日志但无回复，opencode 进程悬挂

### 根本原因
`doChat()` 里 `loadSession()` 取出的 session ID 是上一引擎格式的，直接传给新引擎的 `--session` 参数，新引擎无法 resume，又不返回 error event，自动 fallback 逻辑无法触发。

### 临时 Workaround
切换引擎前手动删除 `.golem/sessions.json`，或调用 `POST /reset`。

### 修复方案（已实施）
`SessionEntry` 新增 `engineType` 字段。`loadSession` 时若存储的 `engineType` 与当前引擎不符，直接返回 `undefined`（相当于全新 session），让引擎从零开始而不是尝试 resume 一个外来 session ID。`saveSession` 同步写入当前 `engineType`。

相关文件：`src/session.ts`（`SessionEntry` 接口、`loadSession`、`saveSession`）；`src/index.ts`（调用处传入 `engineType`）。

---

---

## Issue 3 · Telegram 群 @mention 消息不被投递（privacy mode 默认 ON）

**发现时间**: 2026-03-03
**测试阶段**: Telegram A-3 Group mention-only
**严重级别**: High（群聊功能完全失效）

### 现象
Telegram bot 默认 privacy mode 为 ON（`can_read_all_group_messages: false`）。此模式下，Telegram **只**投递命令（`/start` 等），@mention 消息根本不会发送给 bot——grammy 长轮询收不到 update，handler 自然不触发。验证：`/start` 可收到，`@golemsy_bot hello` 收不到。

### 根本原因
Telegram Bot API 行为：privacy mode ON + bot 非群管理员 = 只投递 `/commands`，@mention 被过滤。

### 修复方案
1. **关闭 privacy mode**（推荐）：@BotFather → `/setprivacy` → 选 bot → Disable → 重启 bot 后生效
2. 将 bot 设为群管理员

### 文档需补充
`docs/channels/telegram.md` 应明确说明：群聊使用时必须通过 @BotFather 关闭 privacy mode，否则 @mention 不会被投递。

---

## Issue 4 · Telegram 群 @mention 不触发回复（双重 bug）

**发现时间**: 2026-03-03
**测试阶段**: Telegram A-3 Group mention-only
**严重级别**: High（群聊 @mention 功能完全失效）
**状态**: ✅ 已修复

### 现象
关闭 privacy mode 并重新邀请 bot 后，群里发 `@golemsy_bot hello` 仍无回复，gateway 日志无任何处理记录。

### 根本原因（两处 bug 叠加）

**Bug 1**：`src/channels/telegram.ts` 使用 `bot.on('message:text', ...)` 注册处理器。经测试确认，grammy 的 `message:text` 过滤器对含 mention 实体的群消息**不触发**（`message` handler 触发，`message:text` 不触发）。因此群 @mention 消息根本不进入处理器。

**Bug 2**：adapter 调用 `onMessage()` 时未传 `mentioned: true`，导致 `gateway.ts` 的第二轮 mention 检查（`detectMention(msg.text, config.name)`）也失败——因为 adapter 已经 strip 了 `@botUsername`，且 `config.name`（`golem-test`）与 Telegram 机器人用户名（`golemsy_bot`）不同。

### 修复方案
1. 将 `bot.on('message:text', ...)` 改为 `bot.on('message', ...)`，在 handler 内手动判断 `if (!message?.text) return`
2. 当群消息被 @mention 时，`onMessage()` 的 payload 里加上 `mentioned: true`

两处修复均已提交到 `src/channels/telegram.ts`。

---

## Issue 5 · Slack/飞书/钉钉群 @mention 消息被 gateway 静默丢弃

**发现时间**: 2026-03-03
**测试阶段**: Slack C-2 Channel mention-only
**严重级别**: High（群聊 @mention 功能完全失效）
**影响范围**: Slack、飞书、钉钉三个 adapter
**状态**: ✅ 已修复

### 现象
在 Slack 频道里 `@GolemBot what's 2+2?`，bot 无回复，gateway 日志无任何 "received" 记录。通过临时 debug log 确认：`app_mention` 事件确实到达了 Bolt 的事件处理器，但 `onMessage` 之后没有产生任何日志。

### 根本原因
Slack adapter 的 `app_mention` 处理器在调用 `onMessage` 前已把 `<@BOT_ID>` strip 掉，但没有设置 `mentioned: true`。gateway 的 mention 检查逻辑为：

```typescript
const mentioned = detectMention(msg.text, config.name) || !!msg.mentioned;
if (gc.groupPolicy === 'mention-only' && !mentioned) return;
```

- `detectMention(strippedText, 'golem-test')` → `false`（文本中已无 @token）
- `!!msg.mentioned` → `false`（adapter 未设置）
- 结果：`mentioned-only` 模式下直接 `return`，消息被静默丢弃

**同样问题存在于**：
- 飞书 adapter：群消息在 adapter 内已过滤（仅转发被 @mention 的消息），但 `mentioned` 字段未设置
- 钉钉 adapter：平台本身只投递 @mention 消息，但 `mentioned` 字段未设置

### 修复方案
在 `app_mention` / 飞书群消息 / 钉钉群消息的 `onMessage` payload 中加入 `mentioned: true`：
- `src/channels/slack.ts`: `onMessage({ ..., mentioned: true })`
- `src/channels/feishu.ts`: `onMessage({ ..., mentioned: chatType === 'group' ? true : undefined })`
- `src/channels/dingtalk.ts`: `onMessage({ ..., mentioned: isGroup ? true : undefined })`

---

## Issue 2 · 长回复"批量投递"体验差

**发现时间**: 2026-03-03
**测试阶段**: Telegram A-2 DM Long Reply Splitting
**严重级别**: Medium（UX 问题，非功能 bug）
**状态**: ✅ 已修复

### 现象
生成 3000 字回复时，用户等待约 60 秒看不到任何反馈，引擎生成完毕后 5 条消息几乎同时到达。

### 根本原因
`handleMessage` 先将引擎全部 text 事件累积成完整 `reply` 字符串，完成后才 `splitMessage` + 逐 chunk `adapter.reply()`。对 IM 平台不支持 streaming 这一设计决策是正确的，但缺少中间反馈。

### 修复方案（已实施）
在 `ChannelAdapter` 接口新增可选 `typing?(msg): Promise<void>` 方法。`gateway.ts` 的 `handleMessage` 在调用 AI 前立即触发一次 typing，并每 4 秒刷新（Telegram 的 typing 动作 ~5s 过期），直到 AI 回复完毕（`finally` 块清除 interval）。

Telegram adapter 实现：`bot.api.sendChatAction(chatId, 'typing')`。其他平台可按需实现同一接口：
- Slack：`chat.postMessage` ephemeral 或 reaction emoji
- Discord：`channel.sendTyping()`
