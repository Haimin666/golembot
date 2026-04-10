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
    # 可选：流式卡片模板ID，用于打字机效果
    cardTemplateId: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx.schema
```

```sh
# .env
DINGTALK_CLIENT_ID=dingxxxxxxxxxx
DINGTALK_CLIENT_SECRET=xxxxxxxxxxxxxxxxxx
```

### 流式卡片（可选）

要启用打字机效果，需要在钉钉开放平台创建交互式卡片模板：

1. 在钉钉开放平台创建卡片模板
2. 复制模板 ID 到 `cardTemplateId` 字段
3. 卡片模板需要包含名为 `content` 的变量

## 启动

```bash
golembot gateway --verbose
```

## 群聊行为

钉钉群被视为**群聊**。通过 `golem.yaml` 中的 `groupChat` 字段配置响应策略：

```yaml
groupChat:
  groupPolicy: mention-only  # 钉钉推荐使用此模式
```

::: warning 平台限制
钉钉 Stream SDK（`TOPIC_ROBOT`）**仅投递 @mention 机器人的消息**，非 mention 的群消息不会发送给 bot 进程。这意味着：

- `mention-only` — 正常工作
- `smart` — 无法观察非 mention 消息，无法积累群上下文
- `always` — 行为等同于 `mention-only`（平台侧过滤）

建议钉钉用户使用 `mention-only` 模式。
:::

## 说明

- Stream 模式使用出站 WebSocket — 可在 NAT/防火墙后运行
- 回复发送到每条消息提供的 session webhook URL
- 最大消息长度 4,000 字符；更长的回复会自动拆分
