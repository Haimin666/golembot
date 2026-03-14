import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface TokenMeta {
  /** SHA-256 prefix (first 8 hex chars) of the token — detects rotation. */
  tokenHash: string;
  /** ISO timestamp when this token was first seen by GolemBot. */
  firstSeenAt: string;
  /** Expected validity in days. Default: 365 (setup-token). */
  validityDays: number;
}

const META_FILE = 'token-meta.json';
const DEFAULT_VALIDITY_DAYS = 365;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex').slice(0, 8);
}

/**
 * Load token metadata from `.golem/token-meta.json`.
 * Returns `null` if the file does not exist.
 */
export async function loadTokenMeta(golemDir: string): Promise<TokenMeta | null> {
  try {
    const raw = await readFile(join(golemDir, META_FILE), 'utf-8');
    return JSON.parse(raw) as TokenMeta;
  } catch {
    return null;
  }
}

/**
 * Ensure token metadata exists. Creates or resets the file when the token
 * hash changes (i.e. the user rotated the token).
 */
export async function ensureTokenMeta(golemDir: string, token: string): Promise<TokenMeta> {
  const hash = hashToken(token);
  const existing = await loadTokenMeta(golemDir);

  if (existing && existing.tokenHash === hash) return existing;

  // New token or rotated — (re)create metadata
  const meta: TokenMeta = {
    tokenHash: hash,
    firstSeenAt: new Date().toISOString(),
    validityDays: DEFAULT_VALIDITY_DAYS,
  };
  await mkdir(golemDir, { recursive: true });
  await writeFile(join(golemDir, META_FILE), JSON.stringify(meta, null, 2));
  return meta;
}

/** Estimated days until the token expires (based on first-seen date). */
export function daysUntilExpiry(meta: TokenMeta): number {
  const firstSeen = new Date(meta.firstSeenAt).getTime();
  const expiresAt = firstSeen + meta.validityDays * 86_400_000;
  return Math.max(0, Math.round((expiresAt - Date.now()) / 86_400_000));
}
