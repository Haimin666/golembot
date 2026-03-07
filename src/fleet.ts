// ── Fleet Dashboard — multi-bot aggregate view ──────────────────────────────
//
// Each gateway auto-registers itself at ~/.golembot/fleet/<name>-<port>.json.
// The fleet server reads that directory to discover all running bots.

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { mkdir, writeFile, unlink, readdir, readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { request as httpRequest } from 'node:http';
import { esc, formatUptime, FAVICON, DOCS_BASE, ENGINE_COLORS, BASE_CSS } from './ui-shared.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface FleetEntry {
  name: string;
  url: string;
  pid: number;
  engine: string;
  model?: string;
  version: string;
  startedAt: string;
  channels: { type: string; status: string }[];
  authEnabled: boolean;
}

export interface FleetInstance extends FleetEntry {
  alive: boolean;
  metrics?: {
    totalMessages: number;
    totalCostUsd: number;
    avgDurationMs: number;
    uptime: number;
  };
}

// ── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_FLEET_DIR = join(homedir(), '.golembot', 'fleet');

// ── Registry I/O ─────────────────────────────────────────────────────────────

function entryFileName(name: string, port: number): string {
  const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '-');
  return `${safeName}-${port}.json`;
}

export async function registerInstance(entry: FleetEntry, fleetDir = DEFAULT_FLEET_DIR): Promise<void> {
  await mkdir(fleetDir, { recursive: true });
  const url = new URL(entry.url);
  const port = Number(url.port) || 3000;
  const filePath = join(fleetDir, entryFileName(entry.name, port));
  await writeFile(filePath, JSON.stringify(entry, null, 2));
}

export async function unregisterInstance(name: string, port: number, fleetDir = DEFAULT_FLEET_DIR): Promise<void> {
  const filePath = join(fleetDir, entryFileName(name, port));
  await unlink(filePath).catch((e: NodeJS.ErrnoException) => {
    if (e.code !== 'ENOENT') throw e;
  });
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function listInstances(fleetDir = DEFAULT_FLEET_DIR): Promise<FleetInstance[]> {
  let files: string[];
  try {
    files = await readdir(fleetDir);
  } catch {
    return [];
  }

  const instances: FleetInstance[] = [];

  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const filePath = join(fleetDir, file);
    try {
      const raw = await readFile(filePath, 'utf-8');
      const entry: FleetEntry = JSON.parse(raw);
      const alive = isProcessAlive(entry.pid);

      if (!alive) {
        // Clean up stale registration
        await unlink(filePath).catch(() => {});
        continue;
      }

      instances.push({ ...entry, alive });
    } catch {
      // Malformed JSON — skip
    }
  }

  return instances;
}

export async function fetchInstanceMetrics(instance: FleetInstance): Promise<FleetInstance> {
  if (instance.authEnabled) return instance;

  return new Promise<FleetInstance>((resolve) => {
    const url = new URL('/api/status', instance.url);
    const req = httpRequest(url, { timeout: 2000 }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        try {
          const data = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
          resolve({
            ...instance,
            metrics: {
              totalMessages: data.metrics?.totalMessages ?? 0,
              totalCostUsd: data.metrics?.totalCostUsd ?? 0,
              avgDurationMs: data.metrics?.avgDurationMs ?? 0,
              uptime: data.uptime ?? 0,
            },
          });
        } catch {
          resolve(instance);
        }
      });
    });
    req.on('error', () => resolve(instance));
    req.on('timeout', () => { req.destroy(); resolve(instance); });
    req.end();
  });
}

// ── Fleet Dashboard HTML ─────────────────────────────────────────────────────

const FLEET_CSS = `${BASE_CSS}

/* Fleet-specific styles */
.bot-card{position:relative;transition:border-color .2s}
.bot-card:hover{border-color:var(--accent)}
.bot-name{font-size:16px;font-weight:600;margin-bottom:8px}
.bot-meta{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}
.engine-badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;color:#fff}
.model-badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:500;background:var(--border);color:var(--text)}
.stat-row{display:flex;gap:16px;flex-wrap:wrap;margin-top:8px;font-size:13px}
.stat-item{color:var(--dim)}
.stat-item strong{color:var(--text);font-weight:600}
.dot-green{width:8px;height:8px;border-radius:50%;background:var(--green);display:inline-block;margin-right:6px}
.dot-orange{width:8px;height:8px;border-radius:50%;background:var(--orange);display:inline-block;margin-right:6px}
.channels-list{font-size:12px;color:var(--dim);margin-top:6px}
.open-link{display:inline-block;margin-top:10px;font-size:13px;font-weight:500}
.empty-state{text-align:center;padding:48px 16px;color:var(--dim)}
.empty-state h2{font-size:18px;margin-bottom:8px;color:var(--text)}
.empty-state p{font-size:14px;margin-bottom:16px}
.empty-state code{font-size:13px}
.refresh-dot{width:6px;height:6px;border-radius:50%;background:var(--green);display:inline-block;margin-left:6px;animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
.auth-badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;background:var(--border);color:var(--dim)}
`;

export function renderFleetDashboard(instances: FleetInstance[], version: string): string {
  const botCards = instances.length > 0
    ? instances.map(renderBotCard).join('\n')
    : renderEmptyState();

  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>GolemBot Fleet</title>
<link rel="icon" href="${FAVICON}">
<style>${FLEET_CSS}</style>
</head><body>
<div class="container">
  ${renderFleetHeader(instances.length, version)}
  <div class="grid" id="fleet-grid">
    ${botCards}
  </div>
  ${renderFleetFooter()}
</div>
<script>${renderFleetScript()}</script>
</body></html>`;
}

function renderFleetHeader(count: number, version: string): string {
  const plural = count === 1 ? 'bot' : 'bots';
  return `
  <div class="header">
    <h1><span class="product">GolemBot</span> Fleet</h1>
    <span class="badge" style="background:var(--accent)">${count} ${plural}</span>
    <span class="meta">v${esc(version)} <span class="refresh-dot" title="Auto-refreshing every 10s"></span></span>
  </div>
  <p class="subtitle">${count > 0 ? `${count} running ${plural} discovered` : 'No running bots found'}</p>`;
}

function renderBotCard(inst: FleetInstance): string {
  const engineColor = ENGINE_COLORS[inst.engine] ?? 'var(--dim)';
  const engineName = inst.engine.charAt(0).toUpperCase() + inst.engine.slice(1);

  let statsHtml: string;
  if (inst.authEnabled) {
    statsHtml = '<span class="auth-badge">Auth Required</span>';
  } else if (inst.metrics) {
    const m = inst.metrics;
    statsHtml = `
      <div class="stat-row">
        <span class="stat-item"><strong>${m.totalMessages}</strong> messages</span>
        <span class="stat-item"><strong>$${m.totalCostUsd.toFixed(4)}</strong> cost</span>
        <span class="stat-item"><strong>${m.avgDurationMs > 0 ? (m.avgDurationMs / 1000).toFixed(1) + 's' : '—'}</strong> avg</span>
      </div>`;
  } else {
    statsHtml = '<span class="auth-badge">Unreachable</span>';
  }

  const channelNames = inst.channels
    .filter(c => c.status === 'connected')
    .map(c => c.type.charAt(0).toUpperCase() + c.type.slice(1));
  const channelsHtml = channelNames.length > 0
    ? `<div class="channels-list">${channelNames.join(', ')}</div>`
    : '';

  const uptime = formatUptime(Date.now() - new Date(inst.startedAt).getTime());

  return `
    <div class="card bot-card">
      <div class="bot-name"><span class="dot-green"></span>${esc(inst.name)}</div>
      <div class="bot-meta">
        <span class="engine-badge" style="background:${engineColor}">${esc(engineName)}</span>
        ${inst.model ? `<span class="model-badge">${esc(inst.model)}</span>` : ''}
      </div>
      <div class="stat-row">
        <span class="stat-item">Up <strong data-started="${esc(inst.startedAt)}">${uptime}</strong></span>
        <span class="stat-item">PID <strong>${inst.pid}</strong></span>
      </div>
      ${statsHtml}
      ${channelsHtml}
      <a class="open-link" href="${esc(inst.url)}" target="_blank">Open Dashboard &rarr;</a>
    </div>`;
}

function renderEmptyState(): string {
  return `
    <div class="empty-state">
      <h2>No running bots found</h2>
      <p>Start a gateway to see it here:</p>
      <code>golembot gateway</code>
    </div>`;
}

function renderFleetFooter(): string {
  return `
  <p style="text-align:center;margin-top:24px;font-size:12px;color:var(--dim)">
    <a href="${DOCS_BASE}">GolemBot Docs</a>
  </p>`;
}

function renderFleetScript(): string {
  return `
    var _lastHash = null;
    async function refresh() {
      try {
        const res = await fetch('/api/fleet');
        const data = await res.json();
        if (_lastHash === null) { _lastHash = data._hash; return; }
        if (data._hash !== _lastHash) {
          _lastHash = data._hash;
          location.reload();
        }
      } catch { /* retry next tick */ }
    }
    // Update uptimes every second
    setInterval(function() {
      document.querySelectorAll('[data-started]').forEach(function(el) {
        var ms = Date.now() - new Date(el.dataset.started).getTime();
        var s = Math.floor(ms / 1000);
        var m = Math.floor(s / 60);
        var h = Math.floor(m / 60);
        var d = Math.floor(h / 24);
        el.textContent = (d > 0 ? d + 'd ' : '') + (h % 24) + 'h ' + (m % 60) + 'm ' + (s % 60) + 's';
      });
    }, 1000);
    setInterval(refresh, 10000);
  `;
}

// ── Fleet HTTP Server ────────────────────────────────────────────────────────

export interface FleetServerOpts {
  port?: number;
  hostname?: string;
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function getFleetData(fleetDir?: string): Promise<FleetInstance[]> {
  const instances = await listInstances(fleetDir);
  return Promise.all(instances.map(fetchInstanceMetrics));
}

export async function startFleetServer(opts: FleetServerOpts = {}, fleetDir?: string): Promise<void> {
  const port = opts.port ?? 4000;
  const hostname = opts.hostname ?? '127.0.0.1';

  // Read version from package.json
  let version = '0.0.0';
  try {
    const selfDir = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(await readFile(join(selfDir, '..', 'package.json'), 'utf-8'));
    version = pkg.version ?? version;
  } catch { /* dev mode */ }

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const path = url.pathname;

    if (path === '/health' && req.method === 'GET') {
      json(res, 200, { status: 'ok' });
      return;
    }

    if (path === '/api/fleet' && req.method === 'GET') {
      const instances = await getFleetData(fleetDir);
      const hash = instances.map(i => `${i.name}:${i.pid}:${i.metrics?.totalMessages ?? 0}`).join('|');
      json(res, 200, { instances, _hash: hash });
      return;
    }

    if (path === '/' && req.method === 'GET') {
      const instances = await getFleetData(fleetDir);
      const html = renderFleetDashboard(instances, version);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    json(res, 404, { error: 'Not found' });
  });

  return new Promise((resolve) => {
    server.listen(port, hostname, () => {
      console.log(`\n  \x1b[1mGolemBot Fleet Dashboard\x1b[0m`);
      console.log(`  \x1b[36m➜\x1b[0m  http://${hostname}:${port}/`);
      console.log(`  \x1b[2mAuto-discovers bots from ~/.golembot/fleet/\x1b[0m\n`);
      resolve();
    });

    const shutdown = () => {
      server.close();
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  });
}
