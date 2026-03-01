---
layout: home

hero:
  name: GolemBot
  text: Run Your Coding Agent Everywhere
  tagline: Connect Cursor, Claude Code, or OpenCode to IM platforms, HTTP APIs, or your own product — with one command.
  image:
    light: /logo-icon-light.svg
    dark: /logo-icon-dark.svg
    alt: GolemBot
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: API Reference
      link: /api/create-assistant

features:
  - icon:
      src: /icons/cpu.svg
    title: Your Agent Is the Brain
    details: GolemBot doesn't reinvent AI. It uses the Coding Agent you already have — Cursor, Claude Code, or OpenCode — as the engine. When the agent gets smarter, your assistant gets smarter automatically.
  - icon:
      src: /icons/plug.svg
    title: Connect Anywhere
    details: One command to go live on Feishu, DingTalk, WeCom, or HTTP. Or embed in your own product with 5 lines of code. No AI framework required.
  - icon:
      src: /icons/folder.svg
    title: Directory Is the Assistant
    details: Skills, memory, config, and work artifacts all live in one directory. Fully transparent, version-controllable, and shareable via git.
---

<div class="home-content">

## Quick Start

Install GolemBot globally, then create and run an assistant in seconds:

```bash
npm install -g golembot

mkdir my-bot && cd my-bot
golembot onboard          # guided setup wizard
golembot run              # interactive REPL
golembot gateway          # start IM + HTTP service
```

Or use as a library — 5 lines of code:

```typescript
import { createAssistant } from 'golembot'
const bot = createAssistant({ dir: './my-bot' })

for await (const ev of bot.chat('Analyze last month sales'))
  if (ev.type === 'text') process.stdout.write(ev.content)
```

## Supported Engines

Switch engines by changing one line in `golem.yaml` — the [StreamEvent](/api/stream-events) API stays the same.

<div class="engines-grid">
  <div class="engine-card">
    <div class="engine-name">Cursor</div>
    <div class="engine-desc">Cursor IDE's agent CLI</div>
    <code>CURSOR_API_KEY</code>
  </div>
  <div class="engine-card">
    <div class="engine-name">Claude Code</div>
    <div class="engine-desc">Anthropic's coding agent</div>
    <code>ANTHROPIC_API_KEY</code>
  </div>
  <div class="engine-card">
    <div class="engine-name">OpenCode</div>
    <div class="engine-desc">Open-source, multi-provider</div>
    <code>OPENAI_API_KEY / ANTHROPIC_API_KEY / ...</code>
  </div>
</div>

## IM Channels

Connect to your team's chat platform — no public IP needed for Feishu and DingTalk.

<div class="channels-grid">
  <div class="channel-card">
    <svg class="channel-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><g fill="currentColor" fill-rule="evenodd" clip-rule="evenodd"><path d="M41.07 5.99L3.31 16.52l9.08 9.29 8.41.15 9.68-9.44a3.6 3.6 0 0 1-.38-1.32c0-.79.31-1.42.8-1.87a2.66 2.66 0 0 1 2.99-.34z"/><path d="M42.1 6.73L31.58 44.49l-9.3-9.08-.14-8.41 9.37-9.52a2.54 2.54 0 0 0 1.66.5c.9-.05 1.49-.6 1.76-.92.27-.32.59-.85.57-1.65a2.57 2.57 0 0 0-.52-1.46z"/></g></svg>
    <div class="channel-name">Feishu (Lark)</div>
    <div class="channel-transport">WebSocket</div>
  </div>
  <div class="channel-card">
    <svg class="channel-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><path fill="currentColor" d="M573.7 252.5C422.5 197.4 201.3 96.7 201.3 96.7c-15.7-4.1-17.9 11.1-17.9 11.1c-5 61.1 33.6 160.5 53.6 182.8c19.9 22.3 319.1 113.7 319.1 113.7S326 357.9 270.5 341.9c-55.6-16-37.9 17.8-37.9 17.8c11.4 61.7 64.9 131.8 107.2 138.4c42.2 6.6 220.1 4 220.1 4s-35.5 4.1-93.2 11.9c-42.7 5.8-97 12.5-111.1 17.8c-33.1 12.5 24 62.6 24 62.6c84.7 76.8 129.7 50.5 129.7 50.5c33.3-10.7 61.4-18.5 85.2-24.2L565 743.1h84.6L603 928l205.3-271.9H700.8l22.3-38.7c.3.5.4.8.4.8S799.8 496.1 829 433.8l.6-1h-.1c5-10.8 8.6-19.7 10-25.8c17-71.3-114.5-99.4-265.8-154.5"/></svg>
    <div class="channel-name">DingTalk</div>
    <div class="channel-transport">Stream</div>
  </div>
  <div class="channel-card">
    <svg class="channel-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><path fill="currentColor" fill-rule="evenodd" d="M909.8 729.6a136 136 0 0 0-47 19a114.2 114.2 0 0 1-51.4 31.1c2.6-17.6 11.3-33.6 24.5-45.4a169.3 169.3 0 0 0 23.4-55c-.1-27.8 22.4-50.5 50.3-50.5 27.8-.1 50.4 22.4 50.5 50.3.1 27.8-22.4 50.5-50.2 50.6zM817.6 608.8a168.8 168.8 0 0 0-54.8-23.7c-27.8 0-50.4-22.6-50.4-50.4s22.6-50.4 50.4-50.4 50.4 22.6 50.4 50.4a137.5 137.5 0 0 0 18.8 47.2 114.8 114.8 0 0 1 30.8 51.7 76.1 76.1 0 0 1-45-24.8zM734.5 431.1C719.3 303.8 587.5 204 428.1 204c-169.9 0-308.1 113.1-308.1 252.2 2.7 78.1 43.9 149.8 110.1 191.4a311 311 0 0 0 33.6 21.6l-13.7 54.6c4.9 2.3 9.7 4.8 14.7 6.9l69-34.5c10.1 2.6 20.7 4.3 31.2 6.1 6.7 1.2 13.4 2.4 20.4 3.3a354.8 354.8 0 0 0 128.8-7.4 249 249 0 0 0 10.2 55.1 425.6 425.6 0 0 1-96.2 11.2 418 418 0 0 1-86.4-9.5l-125.2 62.5a27.6 27.6 0 0 1-30-3.1 28 28 0 0 1-9.7-28.6l22.4-90.2C117.2 643.2 66.5 553.5 64 456.2 64 286 227 148 428.1 148c190.9 0 347.3 124.5 362.5 282.8a245 245 0 0 0-26.5-2.6c-9.9.4-19.8 1.3-29.6 2.9zM618.2 629.9c16.8-3.4 32.7-9.8 47-19a114.2 114.2 0 0 1 51.4-31 76.5 76.5 0 0 1-24.5 45.3c-11 16.8-18.9 35.5-23.4 55.1.1 27.8-22.5 50.4-50.3 50.5s-50.4-22.4-50.5-50.3c-.1-27.8 22.4-50.5 50.2-50.6zm90.8 121.3c16.7 11.2 35.2 19.2 54.7 23.9 20.4 0 38.8 12.3 46.6 31.1s3.5 40.5-10.9 55a50.4 50.4 0 0 1-54.9 10.9c-18.8-7.8-31.1-26.2-31.1-46.6a136.7 136.7 0 0 0-18.7-47.3 114.7 114.7 0 0 1-30.5-51.8 76 76 0 0 1 45 25.1z"/></svg>
    <div class="channel-name">WeCom</div>
    <div class="channel-transport">Webhook</div>
  </div>
  <div class="channel-card">
    <svg class="channel-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v2a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3z"/><path d="M3 15a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v2a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3z"/><circle cx="7" cy="8" r=".5" fill="currentColor"/><circle cx="7" cy="16" r=".5" fill="currentColor"/></svg>
    <div class="channel-name">HTTP API</div>
    <div class="channel-transport">SSE</div>
  </div>
</div>

</div>

<style>
.home-content {
  max-width: 960px;
  margin: 0 auto;
  padding: 0 24px 96px;
}

.home-content h2 {
  font-size: 24px;
  font-weight: 700;
  margin: 64px 0 16px;
  border-bottom: none;
}

.engines-grid,
.channels-grid {
  display: grid;
  gap: 16px;
  margin-top: 16px;
}

.engines-grid {
  grid-template-columns: repeat(3, 1fr);
}

.channels-grid {
  grid-template-columns: repeat(4, 1fr);
}

.engine-card,
.channel-card {
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  padding: 24px;
  text-align: center;
  transition: border-color 0.25s, box-shadow 0.25s;
}

.engine-card:hover,
.channel-card:hover {
  border-color: var(--vp-c-brand-1);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
}

.engine-name,
.channel-name {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 4px;
}

.engine-desc {
  font-size: 14px;
  color: var(--vp-c-text-2);
  margin-bottom: 12px;
}

.engine-card code {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-2);
}

.channel-icon {
  width: 36px;
  height: 36px;
  margin: 0 auto 12px;
  color: var(--vp-c-brand-1);
}

.channel-transport {
  font-size: 13px;
  color: var(--vp-c-text-3);
  margin-top: 4px;
}

@media (max-width: 768px) {
  .engines-grid {
    grid-template-columns: 1fr;
  }
  .channels-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
