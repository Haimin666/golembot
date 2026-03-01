import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadSession, saveSession, clearSession } from '../session.js';

describe('session', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'golem-test-session-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  describe('loadSession (default key)', () => {
    it('returns undefined when no session file exists', async () => {
      expect(await loadSession(dir)).toBeUndefined();
    });

    it('returns undefined when session file is empty JSON', async () => {
      await mkdir(join(dir, '.golem'), { recursive: true });
      await writeFile(join(dir, '.golem', 'sessions.json'), '{}\n', 'utf-8');
      expect(await loadSession(dir)).toBeUndefined();
    });

    it('returns session ID after save', async () => {
      await saveSession(dir, 'abc-123');
      expect(await loadSession(dir)).toBe('abc-123');
    });

    it('returns undefined when file is corrupted', async () => {
      await mkdir(join(dir, '.golem'), { recursive: true });
      await writeFile(join(dir, '.golem', 'sessions.json'), '{{broken', 'utf-8');
      expect(await loadSession(dir)).toBeUndefined();
    });
  });

  describe('Phase 1 format migration', () => {
    it('reads old-style { engineSessionId } as default key', async () => {
      await mkdir(join(dir, '.golem'), { recursive: true });
      await writeFile(
        join(dir, '.golem', 'sessions.json'),
        JSON.stringify({ engineSessionId: 'old-sess' }) + '\n',
        'utf-8',
      );
      expect(await loadSession(dir)).toBe('old-sess');
      expect(await loadSession(dir, 'default')).toBe('old-sess');
    });

    it('treats empty engineSessionId as no session', async () => {
      await mkdir(join(dir, '.golem'), { recursive: true });
      await writeFile(
        join(dir, '.golem', 'sessions.json'),
        JSON.stringify({ engineSessionId: '' }) + '\n',
        'utf-8',
      );
      expect(await loadSession(dir)).toBeUndefined();
    });
  });

  describe('multi-key (sessionKey)', () => {
    it('different keys have independent sessions', async () => {
      await saveSession(dir, 'sess-alice', 'user:alice');
      await saveSession(dir, 'sess-bob', 'user:bob');

      expect(await loadSession(dir, 'user:alice')).toBe('sess-alice');
      expect(await loadSession(dir, 'user:bob')).toBe('sess-bob');
      expect(await loadSession(dir)).toBeUndefined(); // default not set
    });

    it('clearing one key does not affect others', async () => {
      await saveSession(dir, 'sess-a', 'a');
      await saveSession(dir, 'sess-b', 'b');

      await clearSession(dir, 'a');
      expect(await loadSession(dir, 'a')).toBeUndefined();
      expect(await loadSession(dir, 'b')).toBe('sess-b');
    });

    it('overwrites session for same key', async () => {
      await saveSession(dir, 'old', 'k');
      await saveSession(dir, 'new', 'k');
      expect(await loadSession(dir, 'k')).toBe('new');
    });

    it('supports many concurrent keys', async () => {
      for (let i = 0; i < 20; i++) {
        await saveSession(dir, `sess-${i}`, `key-${i}`);
      }
      for (let i = 0; i < 20; i++) {
        expect(await loadSession(dir, `key-${i}`)).toBe(`sess-${i}`);
      }
    });

    it('default key coexists with named keys', async () => {
      await saveSession(dir, 'default-sess');
      await saveSession(dir, 'named-sess', 'named');

      expect(await loadSession(dir)).toBe('default-sess');
      expect(await loadSession(dir, 'named')).toBe('named-sess');

      await clearSession(dir);
      expect(await loadSession(dir)).toBeUndefined();
      expect(await loadSession(dir, 'named')).toBe('named-sess');
    });
  });

  describe('multi-user scenario', () => {
    it('simulates 3 users with interleaved conversations', async () => {
      // User A round 1
      await saveSession(dir, 'a-1', 'user:a');
      // User B round 1
      await saveSession(dir, 'b-1', 'user:b');
      // User A round 2 (resume)
      expect(await loadSession(dir, 'user:a')).toBe('a-1');
      await saveSession(dir, 'a-2', 'user:a');
      // User C joins
      expect(await loadSession(dir, 'user:c')).toBeUndefined();
      await saveSession(dir, 'c-1', 'user:c');
      // User B resets
      await clearSession(dir, 'user:b');
      expect(await loadSession(dir, 'user:b')).toBeUndefined();

      // Verify final state
      expect(await loadSession(dir, 'user:a')).toBe('a-2');
      expect(await loadSession(dir, 'user:c')).toBe('c-1');
    });
  });
});
