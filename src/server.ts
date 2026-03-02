import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { Server as HttpServer } from 'node:http';
import type { Assistant } from './index.js';

export interface ServerOpts {
  port?: number;
  token?: string;
  hostname?: string;
}

/** http.Server extended with a forceClose() method for clean shutdown. */
export interface GolemServer extends HttpServer {
  /** Close all active SSE connections and stop the server. */
  forceClose(): void;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function checkAuth(req: IncomingMessage, token: string | undefined): boolean {
  if (!token) return true;
  const auth = req.headers.authorization;
  return auth === `Bearer ${token}`;
}

export function createGolemServer(assistant: Assistant, opts: ServerOpts = {}): GolemServer {
  const token = opts.token || process.env.GOLEM_TOKEN;
  const activeConnections = new Set<ServerResponse>();

  const server = createHttpServer(async (req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const path = url.pathname;

    // Health (no auth)
    if (path === '/health' && req.method === 'GET') {
      json(res, 200, { status: 'ok', timestamp: new Date().toISOString() });
      return;
    }

    // Auth check for everything below
    if (!checkAuth(req, token)) {
      json(res, 401, { error: 'Unauthorized' });
      return;
    }

    // POST /chat — SSE streaming
    if (path === '/chat' && req.method === 'POST') {
      let body: { message?: string; sessionKey?: string };
      try {
        body = JSON.parse(await readBody(req));
      } catch {
        json(res, 400, { error: 'Invalid JSON body' });
        return;
      }

      if (!body.message || typeof body.message !== 'string') {
        json(res, 400, { error: 'Missing "message" field' });
        return;
      }

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });

      activeConnections.add(res);
      res.on('close', () => activeConnections.delete(res));

      try {
        for await (const event of assistant.chat(body.message, { sessionKey: body.sessionKey })) {
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        }
      } catch (e: unknown) {
        const errEvent = { type: 'error', message: (e as Error).message };
        res.write(`data: ${JSON.stringify(errEvent)}\n\n`);
      }

      activeConnections.delete(res);
      res.end();
      return;
    }

    // POST /reset
    if (path === '/reset' && req.method === 'POST') {
      let body: { sessionKey?: string } = {};
      try {
        const raw = await readBody(req);
        if (raw.trim()) body = JSON.parse(raw);
      } catch {
        json(res, 400, { error: 'Invalid JSON body' });
        return;
      }

      await assistant.resetSession(body.sessionKey);
      json(res, 200, { ok: true });
      return;
    }

    // 404
    json(res, 404, { error: 'Not found' });
  }) as GolemServer;

  server.forceClose = () => {
    for (const res of activeConnections) {
      try {
        res.write(`data: ${JSON.stringify({ type: 'error', message: 'Server shutting down' })}\n\n`);
        res.end();
      } catch { /* best effort */ }
    }
    activeConnections.clear();
    server.close();
  };

  return server;
}

export async function startServer(assistant: Assistant, opts: ServerOpts = {}): Promise<void> {
  const port = opts.port || Number(process.env.GOLEM_PORT) || 3000;
  const hostname = opts.hostname || '127.0.0.1';
  const server = createGolemServer(assistant, opts);

  return new Promise((resolve) => {
    server.listen(port, hostname, () => {
      const tokenStatus = opts.token || process.env.GOLEM_TOKEN ? 'enabled' : 'disabled (set --token or GOLEM_TOKEN)';
      console.log(`🤖 Golem server listening on http://${hostname}:${port}`);
      console.log(`   POST /chat    — SSE streaming chat`);
      console.log(`   POST /reset   — reset session`);
      console.log(`   GET  /health  — health check`);
      console.log(`   Auth: ${tokenStatus}`);
      resolve();
    });
  });
}
