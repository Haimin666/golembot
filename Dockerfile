# 构建阶段 - 使用已有镜像
FROM node:22.5.1-bookworm-slim AS builder

# 使用阿里云镜像源
RUN sed -i 's/deb.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list.d/debian.sources

WORKDIR /app

# 安装 pnpm（使用淘宝镜像）
RUN npm install -g pnpm --registry=https://registry.npmmirror.com

# 复制 package 文件
COPY package.json pnpm-lock.yaml ./

# 安装依赖（使用淘宝镜像）
RUN pnpm config set registry https://registry.npmmirror.com && \
    pnpm install --frozen-lockfile

# 复制源码
COPY . .

# 构建
RUN pnpm build

# 生产阶段 - 使用已有镜像
FROM node:22.5.1-bookworm-slim

# 使用阿里云镜像源
RUN sed -i 's/deb.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list.d/debian.sources

WORKDIR /assistant

# 安装系统依赖（包含 Python）
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    ca-certificates \
    python3 \
    python3-pip \
    python3-venv \
    && ln -s /usr/bin/python3 /usr/bin/python \
    && rm -rf /var/lib/apt/lists/*

# 安装 Python 包（使用清华镜像）
RUN pip3 install --no-cache-dir -i https://pypi.tuna.tsinghua.edu.cn/simple \
    rich \
    requests \
    lxml

# 创建非 root 用户 (UID 1001)
RUN useradd -m -u 1001 -s /bin/bash golem

# 安装 pnpm 和 Claude Code 指定版本（使用淘宝镜像）
RUN npm install -g pnpm && \
    npm install -g @anthropic-ai/claude-code@2.1.72 --registry=https://registry.npmmirror.com

# 复制构建产物和必要文件
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-lock.yaml ./
COPY --from=builder /app/skills ./skills
COPY --from=builder /app/templates ./templates

# 安装生产依赖（使用淘宝镜像）
RUN pnpm config set registry https://registry.npmmirror.com && \
    pnpm install --prod --ignore-scripts

# 创建全局命令链接
RUN ln -s /assistant/dist/cli.js /usr/local/bin/golembot

# 创建配置目录并设置权限
RUN mkdir -p /home/golem/.claude/skills && \
    mkdir -p /assistant/.golem/history && \
    chown -R golem:golem /home/golem/.claude && \
    chown -R golem:golem /assistant/.golem && \
    chown -R golem:golem /assistant

# 切换到非 root 用户
USER golem

EXPOSE 3000

CMD ["node", "/assistant/dist/cli.js", "gateway"]
