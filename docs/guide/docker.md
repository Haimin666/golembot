# Docker Deployment

GolemBot can be deployed as a Docker container for long-running gateway services.

## Dockerfile

The project ships a `Dockerfile`:

```dockerfile
FROM node:22-slim

RUN npm install -g golembot

WORKDIR /assistant
COPY . .

RUN if [ -f package.json ]; then npm install --omit=dev; fi

EXPOSE 3000

CMD ["golembot", "gateway"]
```

## Build & Run

From your assistant directory (where `golem.yaml` lives):

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

Create a `docker-compose.yml` alongside your assistant directory:

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

Then:

```bash
docker compose up -d
```

## Notes

- The Coding Agent CLI (e.g., `claude`) must be available inside the container. The base `node:22-slim` image does not include it — you may need to add an install step for your chosen engine.
- Environment variables containing API keys and channel credentials should be passed via `-e` flags or `env_file`, not baked into the image.
- Feishu, DingTalk, and WeCom all use outbound WebSocket connections and work behind NAT — no public IP required.
- The `EXPOSE 3000` matches the default gateway port. Override with `-e GOLEM_PORT=<port>` if needed.
