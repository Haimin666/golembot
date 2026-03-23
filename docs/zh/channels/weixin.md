# 微信

将你的 GolemBot 助手接入个人微信，使用 iLink Bot API。**无需公网 IP，无需安装 SDK。**

::: tip 零依赖
与其他通道不同，微信适配器仅使用内置的 `fetch` API 与 iLink Bot 服务通信，无需安装任何 npm 包。
:::

## 前提条件

- 一个个人微信账号（Bot 将以该账号身份运行）
- 已安装 `golembot` CLI

## 获取 Token

运行内置的登录命令，通过扫码认证：

```bash
golembot weixin-login
```

1. 终端中会显示一个二维码
2. 打开手机微信 → 扫一扫
3. 确认登录
4. 脚本会打印出你的 **bearer token** — 复制保存

::: warning Token 安全
此 token 可以以你的微信账号身份收发消息，请妥善保管，切勿提交到版本控制。
:::

## 配置

```yaml
# golem.yaml
channels:
  weixin:
    token: ${WEIXIN_BOT_TOKEN}
    # baseUrl: https://ilinkai.weixin.qq.com  # 可选，默认值
```

```sh
# .env 或 shell
export WEIXIN_BOT_TOKEN="扫码登录获取的 token"
```

## 工作原理

- **传输方式**：HTTP 长轮询，对接腾讯 iLink Bot API（`ilinkai.weixin.qq.com`）
- **连接方式**：适配器循环调用 `POST /ilink/bot/getupdates`，每次请求阻塞最多 35 秒等待新消息
- **重连机制**：自动指数退避重试（1s → 2s → 4s → ... → 30s 上限）。收到 HTTP 401（token 过期）时停止轮询并输出错误提示
- **消息类型**：支持文本、图片（CDN 下载 + AES 解密）、语音（含转写文本）、文件、视频
- **图片处理**：图片从腾讯 CDN 下载后通过 AES-128-ECB 解密，传递给 Agent 进行视觉分析
- **回复机制**：通过 `POST /ilink/bot/sendmessage` 发送回复，需携带每条入站消息中的 `context_token`
- **主动推送**：支持向曾经给 Bot 发过消息的用户主动推送（`context_token` 会被缓存）
- **会话类型**：目前仅支持私聊（DM）

## 启动

```bash
golembot gateway --verbose
```

你应该能看到：

```
[weixin] adapter started, polling...

Channels (1 connected)
● WeChat
```

用另一个微信号给 Bot 的微信发一条消息，即可看到回复。

## 定时任务

微信支持定时任务推送。由于微信目前只有私聊，可以省略 `chatId` —— 任务结果会自动发送给所有曾与 Bot 对话过的用户：

```yaml
scheduledTasks:
  - name: daily-report
    cron: "0 9 * * *"
    prompt: "生成今日工作报告"
    target:
      channel: weixin
```

::: info 用户需先发过消息
Bot 只能向缓存了 `context_token` 的用户推送消息。如果 Bot 重启后还没有人发过消息，定时任务将没有接收者。
:::

## 限制

- **不支持输入状态** — iLink API 不提供"正在输入..."状态
- **不支持群聊** — 目前仅支持私聊
- **不支持历史消息** — iLink API 不提供消息历史查询
- **主动推送需要先有联系** — Bot 只能向曾发过消息的用户推送（context_token 缓存在内存中，重启后丢失）
- **Token 过期** — bearer token 可能会在一段时间后过期，重新运行 `golembot weixin-login` 获取新 token
- **消息长度** — 微信限制每条消息最多 2,000 字符，GolemBot 会自动分段发送超长回复

## 备注

- iLink Bot API 是腾讯旗下服务，并非微信开放平台的官方接口
- 无需安装 npm SDK，适配器使用原生 `fetch()`
- `context_token` 按发送者自动管理，无需手动处理
- 图片从腾讯 CDN 下载后在本地通过 AES-128-ECB 解密 —— 图片数据不经过 GolemBot 服务器
