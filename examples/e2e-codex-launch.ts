/**
 * GolemBot E2E — Codex launch mode verification
 *
 * Runs the real Codex CLI through a lightweight wrapper that records argv,
 * then forwards execution to the actual binary unchanged.
 *
 * Coverage:
 *   - default config => unrestricted mode
 *   - explicit codex.mode: safe
 *   - resume path => exec resume
 *   - HTTP service path => real server-triggered Codex launch
 *
 * Run:
 *   pnpm run build && pnpm run e2e:codex:launch
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { chmod, mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { homedir, tmpdir } from 'node:os';
import { join, resolve as resolvePath } from 'node:path';
import { createAssistant, createGolemServer, type StreamEvent } from '../dist/index.js';

try {
  const envPath = resolvePath(new URL('.', import.meta.url).pathname, '..', '.env');
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (val && !process.env[key]) process.env[key] = val;
  }
} catch {
  /* .env not found */
}

const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

type Invocation = {
  argv: string[];
  cwd: string;
  ts: string;
};

let stepNum = 0;
function step(title: string) {
  stepNum++;
  console.log(`\n${CYAN}${BOLD}═══ Step ${stepNum}: ${title} ═══${RESET}\n`);
}

function ok(msg: string) {
  console.log(`${GREEN}  ✓ ${msg}${RESET}`);
}

function fail(msg: string) {
  console.log(`${RED}  ✗ ${msg}${RESET}`);
}

function info(msg: string) {
  console.log(`${DIM}  ${msg}${RESET}`);
}

const results: Array<{ name: string; pass: boolean }> = [];
function record(name: string, pass: boolean) {
  results.push({ name, pass });
  if (pass) ok(name);
  else fail(name);
}

async function createWrapper(realBin: string, dir: string, logPath: string): Promise<string> {
  const wrapperPath = join(dir, 'codex');
  const source = `#!/usr/bin/env node
const { appendFileSync } = require('node:fs');
const { spawnSync } = require('node:child_process');

const real = process.env.REAL_CODEX_BIN;
const log = process.env.CODEX_WRAPPER_LOG;

if (!real) {
  console.error('REAL_CODEX_BIN missing');
  process.exit(1);
}

if (log) {
  appendFileSync(
    log,
    JSON.stringify({
      argv: process.argv.slice(2),
      cwd: process.cwd(),
      ts: new Date().toISOString(),
    }) + '\\n',
    'utf8',
  );
}

const result = spawnSync(real, process.argv.slice(2), {
  stdio: 'inherit',
  env: process.env,
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
`;
  await writeFile(wrapperPath, source, 'utf-8');
  await chmod(wrapperPath, 0o755);
  return wrapperPath;
}

async function readInvocations(logPath: string): Promise<Invocation[]> {
  const raw = await readFile(logPath, 'utf-8').catch(() => '');
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Invocation);
}

async function collectChat(
  assistant: ReturnType<typeof createAssistant>,
  message: string,
  chatOpts?: { sessionKey?: string },
): Promise<{ events: StreamEvent[]; fullText: string; sessionId?: string }> {
  const events: StreamEvent[] = [];
  let fullText = '';
  let sessionId: string | undefined;

  console.log(`  ${YELLOW}> ${message}${RESET}\n`);
  for await (const event of assistant.chat(message, chatOpts)) {
    events.push(event);
    if (event.type === 'text') {
      process.stdout.write(`${DIM}${event.content}${RESET}`);
      fullText += event.content;
    }
    if (event.type === 'done') sessionId = event.sessionId;
    if (event.type === 'warning') console.log(`\n  ${YELLOW}⚠ ${event.message}${RESET}`);
    if (event.type === 'error') console.log(`\n  ${RED}❌ ${event.message}${RESET}`);
  }
  console.log('\n');
  return { events, fullText, sessionId };
}

function httpChat(
  port: number,
  message: string,
  sessionKey: string,
  token: string,
): Promise<{ status: number; events: StreamEvent[]; fullText: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: '/chat',
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString();
          const events: StreamEvent[] = [];
          let fullText = '';
          for (const block of raw.split('\n\n')) {
            if (!block.startsWith('data: ')) continue;
            try {
              const evt: StreamEvent = JSON.parse(block.slice(6));
              events.push(evt);
              if (evt.type === 'text') fullText += evt.content;
            } catch {
              /* ignore malformed chunks */
            }
          }
          resolve({ status: res.statusCode ?? 0, events, fullText });
        });
      },
    );
    req.on('error', reject);
    req.write(JSON.stringify({ message, sessionKey }));
    req.end();
  });
}

function lastInvocation(invocations: Invocation[], startIndex: number): Invocation | undefined {
  return invocations.slice(startIndex).at(-1);
}

async function samePath(a: string | undefined, b: string): Promise<boolean> {
  if (!a) return false;
  const [left, right] = await Promise.all([
    realpath(a).catch(() => a),
    realpath(b).catch(() => b),
  ]);
  return left === right;
}

const dirsToClean: string[] = [];
let originalPath = process.env.PATH ?? '';

try {
  let realCodex = '';
  try {
    realCodex = execSync('which codex', { encoding: 'utf-8', timeout: 5000 }).trim();
  } catch {
    /* not found */
  }

  if (!realCodex) {
    console.log(`${YELLOW}⏭  Codex CLI not found, skipping launch e2e.${RESET}`);
    process.exit(0);
  }

  const apiKey = process.env.OPENAI_API_KEY || process.env.CODEX_API_KEY;
  const hasOAuth = existsSync(join(homedir(), '.codex', 'auth.json'));
  if (!apiKey && !hasOAuth) {
    console.log(`${YELLOW}⏭  No auth found. Set OPENAI_API_KEY / CODEX_API_KEY or run codex login.${RESET}`);
    process.exit(0);
  }

  const defaultModel = process.env.CODEX_MODEL || (apiKey ? 'codex-mini-latest' : undefined);

  console.log(`${CYAN}${BOLD}`);
  console.log(`╔══════════════════════════════════════════════════════════════╗`);
  console.log(`║  GolemBot E2E — Codex launch mode verification              ║`);
  console.log(`╚══════════════════════════════════════════════════════════════╝${RESET}`);

  info(`Real codex: ${realCodex}`);
  info(`Auth: ${apiKey ? 'API key' : 'ChatGPT OAuth'}`);
  info(`Model: ${defaultModel ?? '(server default — OAuth mode)'}`);

  const harnessDir = await mkdtemp(join(tmpdir(), 'golem-codex-launch-'));
  dirsToClean.push(harnessDir);
  const wrapperDir = join(harnessDir, 'bin');
  await mkdir(wrapperDir, { recursive: true });
  const logPath = join(harnessDir, 'codex-invocations.ndjson');
  await createWrapper(realCodex, wrapperDir, logPath);

  process.env.REAL_CODEX_BIN = realCodex;
  process.env.CODEX_WRAPPER_LOG = logPath;
  process.env.PATH = `${wrapperDir}:${originalPath}`;

  function makeAssistant(dir: string) {
    return createAssistant({
      dir,
      engine: 'codex',
      model: defaultModel,
      apiKey,
      timeoutMs: 300_000,
    });
  }

  step('Default mode launches unrestricted Codex');
  {
    const dir = join(harnessDir, 'default-mode');
    await mkdir(dir, { recursive: true });
    const assistant = makeAssistant(dir);
    await assistant.init({ engine: 'codex', name: 'default-mode-bot' });

    const startIndex = (await readInvocations(logPath)).length;
    const { fullText } = await collectChat(assistant, 'Reply with OK only.');
    const invocation = lastInvocation(await readInvocations(logPath), startIndex);

    record('Default chat succeeded', fullText.trim().length > 0);
    record('Default invocation captured', !!invocation);
    record('Default mode uses unrestricted flag', !!invocation?.argv.includes('--dangerously-bypass-approvals-and-sandbox'));
    record('Default mode does not use --full-auto', !invocation?.argv.includes('--full-auto'));
    record('Default mode cwd is workspace', await samePath(invocation?.cwd, dir));
  }

  step('Explicit safe mode launches sandboxed Codex');
  {
    const dir = join(harnessDir, 'safe-mode');
    await mkdir(dir, { recursive: true });
    const assistant = makeAssistant(dir);
    await assistant.init({ engine: 'codex', name: 'safe-mode-bot' });
    await writeFile(join(dir, 'golem.yaml'), 'name: safe-mode-bot\nengine: codex\ncodex:\n  mode: safe\n', 'utf-8');

    const startIndex = (await readInvocations(logPath)).length;
    const { fullText } = await collectChat(assistant, 'Reply with SAFE only.');
    const invocation = lastInvocation(await readInvocations(logPath), startIndex);

    record('Safe mode chat succeeded', fullText.trim().length > 0);
    record('Safe invocation captured', !!invocation);
    record('Safe mode uses --full-auto', !!invocation?.argv.includes('--full-auto'));
    record(
      'Safe mode does not use unrestricted flag',
      !invocation?.argv.includes('--dangerously-bypass-approvals-and-sandbox'),
    );
  }

  step('Second turn resumes with exec resume');
  {
    const dir = join(harnessDir, 'resume-mode');
    await mkdir(dir, { recursive: true });
    const assistant = makeAssistant(dir);
    await assistant.init({ engine: 'codex', name: 'resume-mode-bot' });

    await collectChat(assistant, 'Remember the word RIVER. Reply with READY.', { sessionKey: 'resume-user' });
    const startIndex = (await readInvocations(logPath)).length;
    const { fullText } = await collectChat(assistant, 'What word did I ask you to remember?', { sessionKey: 'resume-user' });
    const invocation = lastInvocation(await readInvocations(logPath), startIndex);

    record('Resume turn succeeded', fullText.trim().length > 0);
    record('Resume invocation captured', !!invocation);
    record('Resume uses exec resume', invocation?.argv[0] === 'exec' && invocation?.argv[1] === 'resume');
    record('Resume keeps unrestricted default', !!invocation?.argv.includes('--dangerously-bypass-approvals-and-sandbox'));
  }

  step('HTTP server path also launches real Codex');
  {
    const dir = join(harnessDir, 'http-mode');
    await mkdir(dir, { recursive: true });
    const assistant = makeAssistant(dir);
    await assistant.init({ engine: 'codex', name: 'http-mode-bot' });

    const token = 'codex-launch-e2e-token';
    const server = createGolemServer(assistant, { token });
    try {
      const port = await new Promise<number>((resolve) => {
        server.listen(0, '127.0.0.1', () => {
          const addr = server.address() as { port: number };
          resolve(addr.port);
        });
      });

      const startIndex = (await readInvocations(logPath)).length;
      const res = await httpChat(port, 'Reply from HTTP in one short sentence.', 'http-user', token);
      const invocation = lastInvocation(await readInvocations(logPath), startIndex);

      record('HTTP chat returns 200', res.status === 200);
      record('HTTP chat produced text', res.fullText.trim().length > 0);
      record('HTTP path invocation captured', !!invocation);
      record('HTTP path uses unrestricted default', !!invocation?.argv.includes('--dangerously-bypass-approvals-and-sandbox'));
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  console.log(`\n${CYAN}${BOLD}════════════════════════ Summary ════════════════════════${RESET}\n`);
  for (const result of results) {
    console.log(`  ${result.pass ? GREEN + '✓' : RED + '✗'} ${result.name}${RESET}`);
  }

  const passed = results.filter((item) => item.pass).length;
  const total = results.length;
  console.log(`\n  ${passed === total ? GREEN : RED}${BOLD}Result: ${passed}/${total} passed${RESET}\n`);
  process.exit(passed === total ? 0 : 1);
} catch (error) {
  console.error(`\n${RED}${BOLD}Launch E2E failed:${RESET}`, error);
  process.exit(1);
} finally {
  process.env.PATH = originalPath;
  delete process.env.REAL_CODEX_BIN;
  delete process.env.CODEX_WRAPPER_LOG;
  for (const dir of dirsToClean) {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
