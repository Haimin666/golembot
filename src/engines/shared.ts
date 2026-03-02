import { execFileSync } from 'node:child_process';

const ANSI_RE = /\x1b\[[^a-zA-Z]*[a-zA-Z]/g;

export function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, '');
}

export function isOnPath(cmd: string): boolean {
  try {
    execFileSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
