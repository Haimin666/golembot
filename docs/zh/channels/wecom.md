# 企业微信

通过 Webhook 回调模式将 GolemBot 助手接入企业微信。**需要公网 URL**。

## 前置条件

```bash
pnpm add @wecom/crypto xml2js
```

## 企业微信管理后台配置

1. 前往[企业微信管理后台](https://work.weixin.qq.com/) → **应用管理** → 创建新应用
2. 记下 **Corp ID**、**Agent ID** 和 **Secret**
3. 在**接收消息** → **API 设置**中：
   - 设置回调 URL 为 `http://<your-host>:<port>/wecom`
   - 生成并记下 **Token** 和 **Encoding AES Key**

## 配置

```yaml
# golem.yaml
channels:
  wecom:
    corpId: ${WECOM_CORP_ID}
    agentId: ${WECOM_AGENT_ID}
    secret: ${WECOM_SECRET}
    token: ${WECOM_TOKEN}
    encodingAESKey: ${WECOM_ENCODING_AES_KEY}
    port: 9000    # 可选，默认：9000
```

```sh
# .env
WECOM_CORP_ID=wwxxxxxxxxxx
WECOM_AGENT_ID=1000001
WECOM_SECRET=xxxxxxxxxxxxxxxxxx
WECOM_TOKEN=xxxxxxxxxx
WECOM_ENCODING_AES_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

## 端口配置

企业微信适配器运行自己的 HTTP 服务器（独立于 Gateway 的 HTTP 服务），监听 `port` 配置的端口（默认：`9000`）。

## 启动

```bash
golembot gateway --verbose
```

## 说明

- 与飞书和钉钉不同，企业微信需要**入站 HTTP** — 你的服务器必须可从公网访问
- 如果在本地运行，使用反向代理（nginx、Caddy）或隧道（ngrok、Cloudflare Tunnel）
- 最大消息长度 2,048 字符；更长的回复会自动拆分
