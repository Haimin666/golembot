# Docker 部署

GolemBot 可作为 Docker 容器部署，用于长期运行 Gateway 服务。

## Dockerfile

项目自带 `Dockerfile`：

```dockerfile
FROM node:22-slim

RUN npm install -g golembot

WORKDIR /assistant
COPY . .

RUN if [ -f package.json ]; then npm install --omit=dev; fi

EXPOSE 3000

CMD ["golembot", "gateway"]
```

## 构建和运行

在助手目录（`golem.yaml` 所在位置）中：

```bash
docker build -t my-bot .
docker run -d \
  --name my-bot \
  -p 3000:3000 \
  -e ANTHROPIC_API_KEY=sk-ant-xxx \
  -e FEISHU_APP_ID=cli_xxx \
  -e FEISHU_APP_SECRET=xxx \
  -e GOLEM_TOKEN=my-secret \
  my-bot
```

## Docker Compose

在助手目录旁创建 `docker-compose.yml`：

```yaml
services:
  golembot:
    build: .
    ports:
      - "3000:3000"
    env_file:
      - .env
    restart: unless-stopped
```

然后：

```bash
docker compose up -d
```

## 注意事项

- Coding Agent CLI（如 `claude`）需要在容器内可用。基础镜像 `node:22-slim` 不包含它 — 你可能需要添加安装步骤。
- API Key 和通道凭据应通过 `-e` 或 `env_file` 传递，不要写入镜像。
- 飞书、钉钉和企业微信都使用出站 WebSocket 连接，可以在 NAT 后运行，无需公网 IP。
