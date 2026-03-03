/**
 * Multi-bot group chat demo
 *
 * Demonstrates two GolemBot instances sharing a mock group channel:
 *   - researcher (smart mode)  — observes all messages, speaks when valuable
 *   - coder (mention-only)     — only responds when @mentioned
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... node run.mjs
 *
 * Optional env:
 *   GOLEM_VERBOSE=1   — print verbose gateway logs
 *   GOLEM_TIMEOUT=60  — agent invocation timeout in seconds (default: 60)
 */

import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { GroupRoom } from './adapters/mock-group-adapter.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Config ───────────────────────────────────────────────────────────────────

const VERBOSE = process.env.GOLEM_VERBOSE === '1';
const TIMEOUT_SEC = Number(process.env.GOLEM_TIMEOUT ?? 60);
const CHAT_ID = 'demo-room';

// Messages to inject (simulating a human kicking off collaboration)
const SCRIPT = [
  {
    delay: 500,
    sender: 'alice',
    text: '@researcher What are the main trade-offs between REST and GraphQL APIs? Then ask @coder to show a minimal GraphQL resolver example.',
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function log(msg) {
  console.log(msg);
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Ensure a bot workspace has AGENTS.md so the engine can start.
 */
async function ensureBotWorkspace(botDir, builtinSkillsDir) {
  const { initWorkspace, ensureReady, scanSkills, generateAgentsMd } = await import('../../dist/workspace.js');

  // Check if already initialized
  try {
    const { config, skills } = await ensureReady(botDir);
    await generateAgentsMd(botDir, skills, config.systemPrompt);
    return { config, skills };
  } catch {
    // Not initialized yet — shouldn't happen since golem.yaml already exists,
    // but scanSkills/AGENTS.md may be missing
    const skills = await scanSkills(botDir);
    const { loadConfig } = await import('../../dist/workspace.js');
    const config = await loadConfig(botDir);
    await generateAgentsMd(botDir, skills, config.systemPrompt);
    return { config, skills };
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY is not set.');
    console.error('Usage: ANTHROPIC_API_KEY=sk-... node run.mjs');
    process.exit(1);
  }

  log('\n╔══════════════════════════════════════════╗');
  log('║   Multi-Bot Group Chat Demo              ║');
  log('╚══════════════════════════════════════════╝\n');
  log('Bots:');
  log('  researcher — smart mode (observes all, speaks when valuable)');
  log('  coder      — mention-only (responds only when @mentioned)\n');

  const botADir = resolve(__dirname, 'bot-a');
  const botBDir = resolve(__dirname, 'bot-b');
  const builtinSkillsDir = resolve(__dirname, '../../skills');

  // Prepare AGENTS.md for both bots
  log('Preparing workspaces...');
  await ensureBotWorkspace(botADir, builtinSkillsDir);
  await ensureBotWorkspace(botBDir, builtinSkillsDir);

  // Create shared group room
  const room = new GroupRoom();
  room.setMaxListeners(20);

  // Track conversation turn order
  const turns = [];
  const stats = { pass: 0, replies: 0, errors: 0 };

  // Intercept room messages for logging
  room.on('message', (msg) => {
    if (msg.senderName === 'researcher' || msg.senderName === 'coder') {
      stats.replies++;
    }
    if (msg.text.trim() === '[PASS]') {
      stats.pass++;
    }
    turns.push({ from: msg.senderName, text: msg.text.slice(0, 120) });
  });

  // ── Start Bot A (researcher, smart mode) ─────────────────────────────────
  log('Starting researcher bot (smart mode)...');
  const { createAssistant } = await import('../../dist/index.js');
  const { loadConfig } = await import('../../dist/workspace.js');
  const { buildSessionKey, detectMention, stripMention } = await import('../../dist/channel.js');
  const { splitMessage, buildGroupPrompt, resolveGroupChatConfig } = await import('../../dist/gateway.js');
  const { createGolemServer } = await import('../../dist/server.js');

  // We start both bots programmatically (same as startGateway does internally)
  // but without opening HTTP ports — just the IM channel handling.

  async function startBotInline(botDir, room) {
    const config = await loadConfig(botDir);
    const assistant = createAssistant({
      dir: botDir,
      apiKey: process.env.ANTHROPIC_API_KEY,
      timeoutMs: TIMEOUT_SEC * 1000,
    });

    const { default: MockGroupAdapter } = await import('./adapters/mock-group-adapter.mjs');
    const adapter = new MockGroupAdapter({
      room,
      botName: config.name,
      channelName: 'mock-group',
    });

    // In-memory group state (same as gateway.ts)
    const groupHistories = new Map();
    const groupTurnCounters = new Map();

    await adapter.start(async (msg) => {
      const userText = msg.chatType === 'group' ? stripMention(msg.text) : msg.text;
      if (!userText) return;

      const groupKey = `${msg.channelType}:${msg.chatId}`;
      const gc = resolveGroupChatConfig(config);

      if (msg.senderName === config.name) return;

      const hist = groupHistories.get(groupKey) ?? [];
      hist.push({ senderName: msg.senderName ?? msg.senderId, text: userText, isBot: false });
      if (hist.length > gc.historyLimit) hist.shift();
      groupHistories.set(groupKey, hist);

      const mentioned = detectMention(msg.text, config.name);
      if (gc.groupPolicy === 'mention-only' && !mentioned) return;

      if ((groupTurnCounters.get(groupKey) ?? 0) >= gc.maxTurns) {
        if (VERBOSE) console.log(`[${config.name}] maxTurns reached, skipping`);
        return;
      }

      await mkdir(join(botDir, 'memory', 'groups'), { recursive: true }).catch(() => {});

      const injectPass = gc.groupPolicy === 'smart' && !mentioned;
      const fullText = buildGroupPrompt(hist, msg.senderName ?? msg.senderId, userText, injectPass, groupKey, botDir);

      if (VERBOSE) {
        console.log(`\n[${config.name}] processing message from ${msg.senderName}...`);
      }

      try {
        let reply = '';
        for await (const event of assistant.chat(fullText, { sessionKey: groupKey })) {
          if (event.type === 'text') reply += event.content;
          else if (event.type === 'error') {
            console.error(`[${config.name}] error: ${event.message}`);
            stats.errors++;
          }
        }

        if (reply.trim() === '[PASS]') {
          stats.pass++;
          if (VERBOSE) console.log(`[${config.name}] [PASS] — staying silent`);
          return;
        }

        if (reply.trim()) {
          const chunks = splitMessage(reply.trim(), 4000);
          for (const chunk of chunks) {
            await adapter.reply(msg, chunk);
          }

          const hist2 = groupHistories.get(groupKey) ?? [];
          hist2.push({ senderName: config.name, text: reply.trim(), isBot: true });
          if (hist2.length > gc.historyLimit) hist2.shift();
          groupHistories.set(groupKey, hist2);
          groupTurnCounters.set(groupKey, (groupTurnCounters.get(groupKey) ?? 0) + 1);
        }
      } catch (e) {
        console.error(`[${config.name}] failed to process message:`, e.message);
        stats.errors++;
      }
    });

    return { config, adapter };
  }

  const botA = await startBotInline(botADir, room);
  log(`  ✅ ${botA.config.name} (${botA.config.groupChat?.groupPolicy ?? 'mention-only'})`);

  const botB = await startBotInline(botBDir, room);
  log(`  ✅ ${botB.config.name} (${botB.config.groupChat?.groupPolicy ?? 'mention-only'})`);

  log('\n─────────────────────────────────────────────');
  log('Starting conversation...\n');

  // ── Inject scripted messages ──────────────────────────────────────────────
  // We need a handle to inject messages; create a temporary adapter just for injection
  const { default: MockGroupAdapter } = await import('./adapters/mock-group-adapter.mjs');
  const injector = new MockGroupAdapter({ room, botName: '__injector__', channelName: 'mock-group' });
  await injector.start(() => {}); // no-op callback, we only send

  const startTime = Date.now();

  for (const step of SCRIPT) {
    await sleep(step.delay);
    log(`[${step.sender}] ${step.text}\n`);
    injector.injectMessage(step.sender, step.text, CHAT_ID);
  }

  // Wait for bots to finish responding (simple: wait until no new messages for 5s, or timeout)
  const IDLE_TIMEOUT = 8000;
  let lastActivityAt = Date.now();
  const activityListener = () => { lastActivityAt = Date.now(); };
  room.on('message', activityListener);

  await new Promise((resolve) => {
    const check = setInterval(() => {
      const idle = Date.now() - lastActivityAt;
      const elapsed = Date.now() - startTime;
      if (idle > IDLE_TIMEOUT || elapsed > TIMEOUT_SEC * 1000) {
        clearInterval(check);
        resolve();
      }
    }, 500);
  });

  room.off('message', activityListener);

  // ── Summary ───────────────────────────────────────────────────────────────
  const totalMs = Date.now() - startTime;
  log('\n─────────────────────────────────────────────');
  log('Demo complete!\n');
  log(`Stats:`);
  log(`  Total elapsed : ${(totalMs / 1000).toFixed(1)}s`);
  log(`  Bot replies   : ${stats.replies}`);
  log(`  [PASS] events : ${stats.pass}`);
  log(`  Errors        : ${stats.errors}`);

  await botA.adapter.stop();
  await botB.adapter.stop();
  await injector.stop();

  process.exit(stats.errors > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
