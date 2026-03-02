import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import http from 'node:http';
import type { StreamEvent, InvokeOpts } from '../engine.js';
import type { GolemServer } from '../server.js';
import { createEngine } from '../engine.js';

vi.mock('../engine.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../engine.js')>();
  return {
    ...original,
    createEngine: vi.fn(() => ({
      async *invoke(_p: string, _opts: InvokeOpts): AsyncIterable<StreamEvent> {
        yield { type: 'text', content: 'hello' };
        yield { type: 'done', sessionId: 'srv-sess-1' };
      },
    })),
  };
});

import { createAssistant } from '../index.js';
import { createGolemServer } from '../server.js';

function request(
  server: http.Server,
  method: string,
  path: string,
  body?: unknown,
  headers?: Record<string, string>,
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const addr = server.address() as { port: number };
    const req = http.request(
      { hostname: '127.0.0.1', port: addr.port, path, method, headers: { 'Content-Type': 'application/json', ...headers } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers, body: Buffer.concat(chunks).toString() }));
      },
    );
    req.on('error', reject);
    if (body !== undefined) req.write(JSON.stringify(body));
    req.end();
  });
}

describe('Golem HTTP Server', () => {
  let dir: string;
  let server: GolemServer;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'golem-test-server-'));
    await writeFile(join(dir, 'golem.yaml'), 'name: srv-bot\nengine: cursor\n');
    await mkdir(join(dir, 'skills', 'general'), { recursive: true });
    await writeFile(join(dir, 'skills', 'general', 'SKILL.md'), '---\nname: general\ndescription: g\n---\n');
  });

  afterEach(async () => {
    if (server?.listening) await new Promise<void>(r => server.close(() => r()));
    await rm(dir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  function startServer(token?: string) {
    const assistant = createAssistant({ dir });
    server = createGolemServer(assistant, { token });
    return new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
  }

  describe('GET /health', () => {
    it('returns 200 without auth', async () => {
      await startServer('secret');
      const res = await request(server, 'GET', '/health');
      expect(res.status).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe('ok');
    });
  });

  describe('POST /chat', () => {
    it('returns SSE stream', async () => {
      await startServer();
      const res = await request(server, 'POST', '/chat', { message: 'hi' });
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('text/event-stream');

      const events = res.body.split('\n\n').filter(Boolean).map(line => {
        const data = line.replace('data: ', '');
        return JSON.parse(data);
      });
      expect(events).toHaveLength(2);
      expect(events[0]).toEqual({ type: 'text', content: 'hello' });
      expect(events[1]).toEqual({ type: 'done', sessionId: 'srv-sess-1' });
    });

    it('passes sessionKey to assistant', async () => {
      await startServer();
      const res = await request(server, 'POST', '/chat', {
        message: 'hi',
        sessionKey: 'feishu:user_123',
      });
      expect(res.status).toBe(200);
      // Should succeed (sessionKey is forwarded internally)
      expect(res.body).toContain('"type":"text"');
    });

    it('returns 400 for missing message', async () => {
      await startServer();
      const res = await request(server, 'POST', '/chat', {});
      expect(res.status).toBe(400);
      expect(JSON.parse(res.body).error).toContain('message');
    });

    it('returns 400 for invalid JSON', async () => {
      await startServer();
      const addr = server.address() as { port: number };
      const res = await new Promise<{ status: number; body: string }>((resolve, reject) => {
        const req = http.request(
          { hostname: '127.0.0.1', port: addr.port, path: '/chat', method: 'POST', headers: { 'Content-Type': 'application/json' } },
          (r) => {
            const chunks: Buffer[] = [];
            r.on('data', (c: Buffer) => chunks.push(c));
            r.on('end', () => resolve({ status: r.statusCode!, body: Buffer.concat(chunks).toString() }));
          },
        );
        req.on('error', reject);
        req.write('not json');
        req.end();
      });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /reset', () => {
    it('returns 200', async () => {
      await startServer();
      const res = await request(server, 'POST', '/reset', { sessionKey: 'test' });
      expect(res.status).toBe(200);
      expect(JSON.parse(res.body).ok).toBe(true);
    });

    it('works with empty body', async () => {
      await startServer();
      const res = await request(server, 'POST', '/reset', {});
      expect(res.status).toBe(200);
    });
  });

  describe('auth', () => {
    it('rejects /chat without token when token is set', async () => {
      await startServer('my-secret');
      const res = await request(server, 'POST', '/chat', { message: 'hi' });
      expect(res.status).toBe(401);
    });

    it('accepts /chat with correct token', async () => {
      await startServer('my-secret');
      const res = await request(server, 'POST', '/chat', { message: 'hi' }, {
        Authorization: 'Bearer my-secret',
      });
      expect(res.status).toBe(200);
    });

    it('rejects /chat with wrong token', async () => {
      await startServer('my-secret');
      const res = await request(server, 'POST', '/chat', { message: 'hi' }, {
        Authorization: 'Bearer wrong',
      });
      expect(res.status).toBe(401);
    });

    it('/health does not require auth', async () => {
      await startServer('my-secret');
      const res = await request(server, 'GET', '/health');
      expect(res.status).toBe(200);
    });
  });

  describe('404', () => {
    it('unknown path returns 404', async () => {
      await startServer();
      const res = await request(server, 'GET', '/nonexistent');
      expect(res.status).toBe(404);
    });
  });

  describe('CORS', () => {
    it('OPTIONS returns 204', async () => {
      await startServer();
      const res = await request(server, 'OPTIONS', '/chat');
      expect(res.status).toBe(204);
      expect(res.headers['access-control-allow-origin']).toBe('*');
    });
  });

  describe('forceClose', () => {
    it('closes active SSE connections with shutdown error event', async () => {
      // Use a slow engine so the SSE connection stays open
      vi.mocked(createEngine).mockReturnValue({
        async *invoke(): AsyncIterable<StreamEvent> {
          await new Promise(r => setTimeout(r, 2000)); // hang
          yield { type: 'done', sessionId: 's' };
        },
      } as any);

      await startServer();
      const addr = server.address() as { port: number };

      // Collect SSE data without waiting for the connection to close
      const received: string[] = [];
      const connectionClosed = new Promise<void>((resolve) => {
        const req = http.request(
          { hostname: '127.0.0.1', port: addr.port, path: '/chat', method: 'POST', headers: { 'Content-Type': 'application/json' } },
          (res) => {
            res.on('data', (chunk: Buffer) => received.push(chunk.toString()));
            res.on('end', resolve);
          },
        );
        req.write(JSON.stringify({ message: 'slow' }));
        req.end();
      });

      // Give the SSE connection time to be established
      await new Promise(r => setTimeout(r, 50));

      // Force close all connections
      server.forceClose();

      await connectionClosed;

      const combined = received.join('');
      expect(combined).toContain('"type":"error"');
      expect(combined).toContain('shutting down');
    }, 5000);
  });
});
