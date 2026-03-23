# GolemBot 发布文案

## V2EX

**标题：** Claude Code 有了官方 Channel，但 Cursor / Codex / OpenCode 呢？GolemBot 让所有 Coding Agent 都能接 IM

**正文：**

Claude Code 最近出了官方的 Channel 功能，可以把 Agent 接到 IM 里。挺好的，但问题是——只有 Claude Code 有。

Cursor 没有。Codex 没有。OpenCode 没有。

我做的开源项目 GolemBot 解决的就是这个问题：**不管你用哪个 Coding Agent，都能一条命令接入 IM。**

支持 4 个引擎：Cursor、Claude Code、OpenCode、Codex
支持 8 个通道：微信、Slack、Telegram、Discord、飞书、钉钉、企业微信、HTTP API

```
golembot init -e codex -n my-bot    # 或 cursor / opencode / claude-code
golembot gateway
```

就这样，你的 Codex 就能在微信群里回消息了。想换 Cursor？改一行 `engine: cursor`，通道那边什么都不用动。

LLM 供应商也可以自由路由——把 OpenCode 指向 DeepSeek，把 Codex 路由到 OpenRouter，一个配置块搞定。

### 微信接入实测

这次上线了个人微信支持，基于腾讯 iLink Bot API，整个过程非常简单：

1. 跑一个 `golembot weixin-login`，终端里弹出二维码
2. 手机微信扫码确认，拿到 bearer token
3. 往 `golem.yaml` 里加两行配置：

```yaml
channels:
  weixin:
    token: ${WEIXIN_BOT_TOKEN}
```

4. `golembot gateway` 启动，就能在微信里跟你的 Coding Agent 聊了

技术上是 HTTP 长轮询，不需要公网 IP，不需要装任何 SDK（纯 `fetch`），适配器自带指数退避重连。目前支持私聊，支持文本 / 图片 / 语音（含转写） / 文件 / 视频消息，超长回复自动分段（微信单条限制 2000 字符）。

### 相比 Claude Code 官方 Channel

Claude Code 官方 Channel 做了它该做的事，但 GolemBot 覆盖了更多场景：

- **引擎不锁定** — 不只是 Claude Code，Cursor / Codex / OpenCode 全部支持，改一行配置切换
- **供应商不锁定** — 4 引擎 × 任意 LLM 供应商（OpenRouter、DeepSeek、MiniMax、硅基流动）
- **内置 Dashboard + Fleet 管理** — 实时指标、通道状态、多 bot 聚合监控
- **13,000+ 社区技能** — 兼容 ClawHub（OpenClaw）技能生态，一条命令搜索安装
- **定时任务（cron）** — 每天自动跑审计、推报告到群里
- **自定义 Adapter** — 邮件、GitHub Issue 等任意消息来源都能接

GitHub: https://github.com/0xranx/golembot
文档: https://0xranx.github.io/golembot/
微信接入指南: https://0xranx.github.io/golembot/zh/channels/weixin
MIT 开源，欢迎试用。

---

## Twitter（中文）

Claude Code 有了官方 Channel，但 Cursor / Codex / OpenCode 呢？

GolemBot 让所有 Coding Agent 都能接入 IM。4 引擎 × 8 通道（微信、Slack、飞书、Telegram……），一条命令启动，改一行配置换引擎。LLM 供应商也随意切换。

刚上线个人微信支持——`golembot weixin-login` 扫码拿 token，加两行配置就能在微信里跟 Coding Agent 聊。不需要公网 IP，不需要装 SDK。

MIT 开源 → github.com/0xranx/golembot

---

## Twitter（English）

Claude Code now has official Channels. Cool. But what about Cursor? Codex? OpenCode?

GolemBot gives every Coding Agent channels — 4 engines × 8 IM platforms (WeChat, Slack, Telegram, Discord...). Swap engines in one line. Route to any LLM provider.

Just shipped WeChat support — QR login, two lines of config, no public IP needed. Your Codex / Cursor / OpenCode agent now lives in WeChat.

MIT open source → github.com/0xranx/golembot

---

## Linux.do

**标题：** 让 Codex、Cursor、OpenCode 也支持接入微信

**正文：**

Claude Code 前两天出了 Channels，可以把 Agent 挂到 Telegram 和 Discord 上，论坛里讨论也不少。我之前做了个开源项目 GolemBot，做的事情差不多，但覆盖面更广一些——不只是 Claude Code，Cursor、Codex、OpenCode 也都能接；通道这边除了 Telegram 和 Discord，还支持微信、飞书、钉钉、企业微信、Slack。

最近刚把个人微信也接上了，简单说下怎么用。

### 接入 IM

装好之后 `golembot init` 初始化一个 bot 目录，`golembot gateway` 启动就行：

```bash
npm install -g golembot
golembot init -e claude-code -n my-bot
golembot gateway
```

引擎那行换成 `codex` / `cursor` / `opencode` 都行，通道配置不用动。

微信的话需要先跑 `golembot weixin-login` 扫个码拿 token，然后 `golem.yaml` 里加上：

```yaml
channels:
  weixin:
    token: ${WEIXIN_BOT_TOKEN}
```

底层走的腾讯 iLink Bot API，HTTP 长轮询，不用公网 IP，不用装额外的包。目前支持私聊，文本/图片/语音/文件都能收。

实际效果：

语音输入——发条语音过去，Agent 直接处理：

![语音输入](https://raw.githubusercontent.com/0xranx/golembot/main/docs/assets/weixin-voice.jpg)

图片输入——发张图，Agent 能识别和分析：

![图片输入](https://raw.githubusercontent.com/0xranx/golembot/main/docs/assets/weixin-image.jpg)

文字输入——正常打字聊就行：

![文字输入](https://raw.githubusercontent.com/0xranx/golembot/main/docs/assets/weixin-text.png)

### 嵌入自己的产品

GolemBot 也可以当 SDK 用，不一定非要走 IM。比如你有个内部工具或者 SaaS，想接一个能写代码、跑脚本的 Agent 进去，几行代码就行：

```typescript
import { createAssistant } from 'golembot';
const bot = createAssistant({ dir: './my-agent' });

for await (const event of bot.chat('帮我看看这个 SQL 有没有性能问题')) {
  if (event.type === 'text') process.stdout.write(event.content);
}
```

支持多用户 session 隔离、并发控制、超时管理，可以直接接 Express、Next.js 这些。具体可以看嵌入指南：https://0xranx.github.io/golembot/zh/guide/embed

### 供应商可以换

引擎和 LLM 供应商是解耦的，比如 OpenCode 接 DeepSeek：

```yaml
engine: opencode
provider:
  baseUrl: "https://api.deepseek.com"
  apiKey: "${DEEPSEEK_API_KEY}"
  model: "deepseek-chat"
```

国产模型 + 微信/飞书这种组合也没问题。

GitHub: https://github.com/0xranx/golembot
文档: https://0xranx.github.io/golembot/
微信接入: https://0xranx.github.io/golembot/zh/channels/weixin
嵌入指南: https://0xranx.github.io/golembot/zh/guide/embed
API 参考: https://0xranx.github.io/golembot/zh/api/create-assistant

MIT 开源，有问题欢迎提 issue。
