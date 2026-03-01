# Configuration

GolemBot uses a single configuration file: `golem.yaml` in the assistant directory root.

## Full Example

```yaml
name: my-assistant
engine: claude-code          # cursor | claude-code | opencode
model: claude-sonnet         # optional, preferred model

# Optional: bypass agent permission prompts
skipPermissions: true

# Optional: IM channel configuration
channels:
  feishu:
    appId: ${FEISHU_APP_ID}
    appSecret: ${FEISHU_APP_SECRET}
  dingtalk:
    clientId: ${DINGTALK_CLIENT_ID}
    clientSecret: ${DINGTALK_CLIENT_SECRET}
  wecom:
    corpId: ${WECOM_CORP_ID}
    agentId: ${WECOM_AGENT_ID}
    secret: ${WECOM_SECRET}
    token: ${WECOM_TOKEN}
    encodingAESKey: ${WECOM_ENCODING_AES_KEY}
    port: 9000

# Optional: gateway service configuration
gateway:
  port: 3000
  host: 127.0.0.1
  token: ${GOLEM_TOKEN}
```

## Fields

### Required

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Assistant name |
| `engine` | `string` | Engine type: `cursor`, `claude-code`, or `opencode` |

### Optional

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `model` | `string` | — | Preferred model (passed to the engine CLI) |
| `skipPermissions` | `boolean` | `true` | Whether to bypass agent permission prompts |
| `channels` | `object` | — | IM channel configurations |
| `gateway` | `object` | — | Gateway service settings |

### `channels`

Configure one or more IM platforms. Only configured channels are started by the gateway.

- `channels.feishu` — see [Feishu setup](/channels/feishu)
- `channels.dingtalk` — see [DingTalk setup](/channels/dingtalk)
- `channels.wecom` — see [WeCom setup](/channels/wecom)

### `gateway`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `port` | `number` | `3000` | HTTP service port |
| `host` | `string` | `127.0.0.1` | Bind address |
| `token` | `string` | — | Bearer token for HTTP API authentication |

## Environment Variable Placeholders

Sensitive fields support `${ENV_VAR}` syntax. At load time, GolemBot resolves these against `process.env`.

```yaml
gateway:
  token: ${GOLEM_TOKEN}    # resolved from process.env.GOLEM_TOKEN
```

This works for all string values within `channels` and `gateway` blocks. Use a `.env` file alongside `golem.yaml` — the CLI auto-loads `.env` from the working directory at startup.

### `.env` Example

```sh
FEISHU_APP_ID=cli_xxxxxxxxxx
FEISHU_APP_SECRET=xxxxxxxxxx
GOLEM_TOKEN=my-secret-token
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxx
```

::: tip
Add `.env` to `.gitignore` and commit `.env.example` (without real values) for sharing.
:::

## Skills Are Not Configured

Skills are **not** declared in `golem.yaml`. The `skills/` directory is the single source of truth — whatever skill directories exist, those capabilities are loaded. See [Skills](/skills/overview).

## GolemConfig TypeScript Type

```typescript
interface GolemConfig {
  name: string;
  engine: string;
  model?: string;
  skipPermissions?: boolean;
  channels?: {
    feishu?: { appId: string; appSecret: string };
    dingtalk?: { clientId: string; clientSecret: string };
    wecom?: {
      corpId: string;
      agentId: string;
      secret: string;
      token: string;
      encodingAESKey: string;
      port?: number;
    };
  };
  gateway?: {
    port?: number;
    host?: string;
    token?: string;
  };
}
```
