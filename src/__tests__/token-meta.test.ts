import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { daysUntilExpiry, ensureTokenMeta, loadTokenMeta, type TokenMeta } from '../token-meta.js';

describe('token-meta', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'golem-token-meta-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('creates token-meta.json on first call', async () => {
    const meta = await ensureTokenMeta(dir, 'sk-ant-oat01-test-token-1234');
    expect(meta.tokenHash).toHaveLength(8);
    expect(meta.validityDays).toBe(365);
    expect(new Date(meta.firstSeenAt).getTime()).toBeLessThanOrEqual(Date.now());

    // File should exist
    const raw = await readFile(join(dir, 'token-meta.json'), 'utf-8');
    const stored = JSON.parse(raw) as TokenMeta;
    expect(stored.tokenHash).toBe(meta.tokenHash);
  });

  it('returns existing meta for same token', async () => {
    const token = 'sk-ant-oat01-same-token';
    const meta1 = await ensureTokenMeta(dir, token);
    const meta2 = await ensureTokenMeta(dir, token);
    expect(meta2.firstSeenAt).toBe(meta1.firstSeenAt);
    expect(meta2.tokenHash).toBe(meta1.tokenHash);
  });

  it('resets firstSeenAt when token changes', async () => {
    const meta1 = await ensureTokenMeta(dir, 'old-token');
    // Backdate firstSeenAt to verify it changes
    const backdated: TokenMeta = { ...meta1, firstSeenAt: '2025-01-01T00:00:00.000Z' };
    await writeFile(join(dir, 'token-meta.json'), JSON.stringify(backdated));

    const meta2 = await ensureTokenMeta(dir, 'new-token');
    expect(meta2.tokenHash).not.toBe(meta1.tokenHash);
    expect(new Date(meta2.firstSeenAt).getFullYear()).toBeGreaterThanOrEqual(2026);
  });

  it('loadTokenMeta returns null when file does not exist', async () => {
    const meta = await loadTokenMeta(dir);
    expect(meta).toBeNull();
  });

  it('loadTokenMeta returns stored meta', async () => {
    await ensureTokenMeta(dir, 'some-token');
    const meta = await loadTokenMeta(dir);
    expect(meta).not.toBeNull();
    expect(meta!.tokenHash).toHaveLength(8);
  });

  describe('daysUntilExpiry', () => {
    it('returns ~365 for a token just created', () => {
      const meta: TokenMeta = {
        tokenHash: 'abcd1234',
        firstSeenAt: new Date().toISOString(),
        validityDays: 365,
      };
      const days = daysUntilExpiry(meta);
      expect(days).toBeGreaterThanOrEqual(364);
      expect(days).toBeLessThanOrEqual(365);
    });

    it('returns 0 for an expired token', () => {
      const meta: TokenMeta = {
        tokenHash: 'abcd1234',
        firstSeenAt: new Date(Date.now() - 400 * 86_400_000).toISOString(),
        validityDays: 365,
      };
      expect(daysUntilExpiry(meta)).toBe(0);
    });

    it('returns correct days for a token 300 days old', () => {
      const meta: TokenMeta = {
        tokenHash: 'abcd1234',
        firstSeenAt: new Date(Date.now() - 300 * 86_400_000).toISOString(),
        validityDays: 365,
      };
      const days = daysUntilExpiry(meta);
      expect(days).toBeGreaterThanOrEqual(64);
      expect(days).toBeLessThanOrEqual(66);
    });
  });
});
