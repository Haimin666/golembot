import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SeenMessageStore } from '../seen-messages.js';

describe('SeenMessageStore', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'golem-test-seen-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('returns false for unknown messages', async () => {
    const store = new SeenMessageStore(dir);
    await store.load();
    expect(store.has('feishu', 'msg1')).toBe(false);
  });

  it('returns true after marking a message', async () => {
    const store = new SeenMessageStore(dir);
    await store.load();
    store.mark('feishu', 'msg1');
    expect(store.has('feishu', 'msg1')).toBe(true);
  });

  it('distinguishes different channels and message IDs', async () => {
    const store = new SeenMessageStore(dir);
    await store.load();
    store.mark('feishu', 'msg1');
    expect(store.has('feishu', 'msg1')).toBe(true);
    expect(store.has('feishu', 'msg2')).toBe(false);
    expect(store.has('slack', 'msg1')).toBe(false);
  });

  it('persists to disk and survives reload', async () => {
    const store1 = new SeenMessageStore(dir);
    await store1.load();
    store1.mark('feishu', 'msg1');
    store1.mark('slack', 'msg2');
    await store1.save();
    store1.stop();

    // Reload from disk
    const store2 = new SeenMessageStore(dir);
    await store2.load();
    expect(store2.has('feishu', 'msg1')).toBe(true);
    expect(store2.has('slack', 'msg2')).toBe(true);
    expect(store2.has('feishu', 'msg3')).toBe(false);
    store2.stop();
  });

  it('handles missing file gracefully', async () => {
    const store = new SeenMessageStore(dir);
    await store.load(); // should not throw
    expect(store.has('feishu', 'anything')).toBe(false);
    store.stop();
  });

  it('handles malformed file gracefully', async () => {
    const { mkdir, writeFile } = await import('node:fs/promises');
    await mkdir(join(dir, '.golem'), { recursive: true });
    await writeFile(join(dir, '.golem', 'seen-messages.json'), 'not json', 'utf-8');

    const store = new SeenMessageStore(dir);
    await store.load(); // should not throw
    expect(store.has('feishu', 'msg1')).toBe(false);
    store.stop();
  });

  it('expires entries after TTL', async () => {
    // Use a very short TTL (100ms)
    const store = new SeenMessageStore(dir, 100);
    await store.load();
    store.mark('feishu', 'msg1');
    expect(store.has('feishu', 'msg1')).toBe(true);

    // Wait for expiry
    await new Promise((r) => setTimeout(r, 150));
    expect(store.has('feishu', 'msg1')).toBe(false);
    store.stop();
  });

  it('does not load expired entries from disk', async () => {
    const store1 = new SeenMessageStore(dir, 100);
    await store1.load();
    store1.mark('feishu', 'msg1');
    await store1.save();
    store1.stop();

    // Wait for expiry
    await new Promise((r) => setTimeout(r, 150));

    const store2 = new SeenMessageStore(dir, 100);
    await store2.load();
    expect(store2.has('feishu', 'msg1')).toBe(false);
    store2.stop();
  });

  it('prunes expired entries on save', async () => {
    const store = new SeenMessageStore(dir, 100);
    await store.load();
    store.mark('feishu', 'expired');

    await new Promise((r) => setTimeout(r, 150));

    // Mark a fresh one so dirty=true
    store.mark('feishu', 'fresh');
    await store.save();
    store.stop();

    // Read raw file — should only contain the fresh entry
    const raw = await readFile(join(dir, '.golem', 'seen-messages.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed['feishu:fresh']).toBeDefined();
    expect(parsed['feishu:expired']).toBeUndefined();
  });

  it('skips save when not dirty', async () => {
    const store = new SeenMessageStore(dir);
    await store.load();
    // No marks → not dirty → save should be a no-op
    await store.save();
    store.stop();

    // File should not be created
    try {
      await readFile(join(dir, '.golem', 'seen-messages.json'), 'utf-8');
      expect.fail('File should not exist');
    } catch (e: any) {
      expect(e.code).toBe('ENOENT');
    }
  });

  it('mark sets dirty flag so save writes to disk', async () => {
    const store = new SeenMessageStore(dir);
    await store.load();
    store.stop(); // disable auto-save timer

    store.mark('feishu', 'msg1');
    store.mark('feishu', 'msg2');
    store.mark('feishu', 'msg3');

    // Explicit save
    await store.save();

    const raw = await readFile(join(dir, '.golem', 'seen-messages.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed['feishu:msg1']).toBeDefined();
    expect(parsed['feishu:msg2']).toBeDefined();
    expect(parsed['feishu:msg3']).toBeDefined();
  });
});
