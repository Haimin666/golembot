# 钉钉

通过 Stream 模式（WebSocket）将 GolemBot 助手接入钉钉。无需公网 IP。

## 前置条件

```bash
pnpm add dingtalk-stream
```

## 钉钉开放平台配置

1. 前往[钉钉开发者后台](https://open-dev.dingtalk.com/)，创建一个机器人应用
2. 在**凭证信息**中，复制 **Client ID**（AppKey）和 **Client Secret**（AppSecret）
3. 在**消息推送**中，选择 **Stream 模式**
4. 按需配置机器人权限

## 配置

```yaml
# golem.yaml
channels:
  dingtalk:
    clientId: ${DINGTALK_CLIENT_ID}
    clientSecret: ${DINGTALK_CLIENT_SECRET}
```

```sh
# .env
DINGTALK_CLIENT_ID=dingxxxxxxxxxx
DINGTALK_CLIENT_SECRET=xxxxxxxxxxxxxxxxxx
```

## 启动

```bash
golembot gateway --verbose
```

## 说明

- Stream 模式使用出站 WebSocket — 可在 NAT/防火墙后运行
- 回复发送到每条消息提供的 session webhook URL
- 最大消息长度 4,000 字符；更长的回复会自动拆分
