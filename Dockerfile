FROM node:22-slim

RUN npm install -g golem-ai

WORKDIR /assistant
COPY . .

RUN if [ -f package.json ]; then npm install --omit=dev; fi

EXPOSE 3000

CMD ["golem-ai", "gateway"]
