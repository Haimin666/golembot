import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const GOLEM_DIR = '.golem';
const SESSION_FILE = 'sessions.json';

const DEFAULT_KEY = 'default';

interface SessionEntry {
  engineSessionId: string;
}

type SessionStore = Record<string, SessionEntry>;

function sessionPath(dir: string): string {
  return join(dir, GOLEM_DIR, SESSION_FILE);
}

async function readStore(dir: string): Promise<SessionStore> {
  try {
    const raw = await readFile(sessionPath(dir), 'utf-8');
    const data = JSON.parse(raw);

    // Migrate Phase 1 format: { engineSessionId: "xxx" } → { default: { engineSessionId: "xxx" } }
    if (typeof data.engineSessionId === 'string') {
      return data.engineSessionId
        ? { [DEFAULT_KEY]: { engineSessionId: data.engineSessionId } }
        : {};
    }

    return data as SessionStore;
  } catch {
    return {};
  }
}

async function writeStore(dir: string, store: SessionStore): Promise<void> {
  const golemDir = join(dir, GOLEM_DIR);
  await mkdir(golemDir, { recursive: true });
  await writeFile(sessionPath(dir), JSON.stringify(store, null, 2) + '\n', 'utf-8');
}

export async function loadSession(dir: string, key?: string): Promise<string | undefined> {
  const store = await readStore(dir);
  const entry = store[key || DEFAULT_KEY];
  return entry?.engineSessionId || undefined;
}

export async function saveSession(dir: string, sessionId: string, key?: string): Promise<void> {
  const store = await readStore(dir);
  store[key || DEFAULT_KEY] = { engineSessionId: sessionId };
  await writeStore(dir, store);
}

export async function clearSession(dir: string, key?: string): Promise<void> {
  const store = await readStore(dir);
  delete store[key || DEFAULT_KEY];
  await writeStore(dir, store);
}
