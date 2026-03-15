/**
 * Pluggable skill registry interface + ClawHub implementation.
 *
 * Bridges to the `clawhub` CLI for search/install operations.
 * No new npm dependencies — requires the user to have `clawhub` installed globally.
 */

import { spawn } from 'node:child_process';
import { cp, mkdir, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isOnPath } from './engines/shared.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SkillSearchResult {
  slug: string;
  name: string;
  description: string;
  version?: string;
  author?: string;
  downloads?: number;
}

export interface SkillInstallResult {
  name: string;
  version: string;
}

// ---------------------------------------------------------------------------
// Registry interface (pluggable)
// ---------------------------------------------------------------------------

export interface SkillRegistry {
  readonly name: string;
  /** Check if the registry's CLI tool is available on PATH. */
  isAvailable(): boolean;
  /** Search for skills matching a natural-language query. */
  search(query: string, limit?: number): Promise<SkillSearchResult[]>;
  /** Install a skill by slug into destDir. */
  install(slug: string, destDir: string): Promise<SkillInstallResult>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function runCli(
  bin: string,
  args: string[],
  opts?: { cwd?: string; timeout?: number },
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const timeout = opts?.timeout ?? 30_000;
    const proc = spawn(bin, args, {
      cwd: opts?.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout,
    });

    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    proc.stdout.on('data', (d: Buffer) => chunks.push(d));
    proc.stderr.on('data', (d: Buffer) => errChunks.push(d));

    proc.on('error', reject);
    proc.on('close', (code) => {
      resolve({
        stdout: Buffer.concat(chunks).toString('utf-8'),
        stderr: Buffer.concat(errChunks).toString('utf-8'),
        code: code ?? 1,
      });
    });
  });
}

// ---------------------------------------------------------------------------
// ClawHub implementation
// ---------------------------------------------------------------------------

/** Parse clawhub search output: `slug  DisplayName  (score)` lines. */
function parseSearchOutput(stdout: string): Array<{ slug: string; name: string }> {
  const results: Array<{ slug: string; name: string }> = [];
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('-') || trimmed.startsWith('✔')) continue;
    // Format: slug  Display Name  (score)
    const match = trimmed.match(/^(\S+)\s+(.+?)\s+\(\d+\.\d+\)$/);
    if (match) {
      results.push({ slug: match[1], name: match[2].trim() });
    }
  }
  return results;
}

export class ClawHubRegistry implements SkillRegistry {
  readonly name = 'clawhub';

  isAvailable(): boolean {
    return isOnPath('clawhub');
  }

  async search(query: string, limit = 10): Promise<SkillSearchResult[]> {
    const { stdout, code } = await runCli('clawhub', ['search', query, '--limit', String(limit)], { timeout: 15_000 });

    if (code !== 0) return [];

    const basic = parseSearchOutput(stdout);
    if (basic.length === 0) return [];

    // Enrich with inspect --json for each result (parallel, best-effort)
    const enriched = await Promise.all(
      basic.map(async (b) => {
        try {
          const detail = await this.inspect(b.slug);
          return detail;
        } catch {
          return {
            slug: b.slug,
            name: b.name,
            description: '',
          } satisfies SkillSearchResult;
        }
      }),
    );

    return enriched;
  }

  /** Fetch detailed metadata for a single skill. */
  async inspect(slug: string): Promise<SkillSearchResult> {
    const { stdout, code } = await runCli('clawhub', ['inspect', slug, '--json'], { timeout: 15_000 });

    if (code !== 0) {
      throw new Error(`clawhub inspect failed for ${slug}`);
    }

    // Extract JSON from output (may have spinner lines before it)
    const jsonStart = stdout.indexOf('{');
    if (jsonStart === -1) throw new Error(`No JSON in inspect output for ${slug}`);
    const json = JSON.parse(stdout.slice(jsonStart));

    const skill = json.skill ?? {};
    const owner = json.owner ?? {};
    const latest = json.latestVersion ?? {};

    return {
      slug: skill.slug ?? slug,
      name: skill.displayName ?? slug,
      description: skill.summary ?? '',
      version: latest.version,
      author: owner.displayName ?? owner.handle,
      downloads: skill.stats?.installsAllTime,
    };
  }

  async install(slug: string, destDir: string): Promise<SkillInstallResult> {
    // Install to a temp workdir so clawhub doesn't pollute the real workspace
    const tmpBase = join(tmpdir(), `golem-clawhub-${Date.now()}`);
    await mkdir(tmpBase, { recursive: true });

    try {
      const { stdout, stderr, code } = await runCli('clawhub', ['install', slug, '--force'], {
        cwd: tmpBase,
        timeout: 60_000,
      });

      if (code !== 0) {
        // Extract clean error message from CLI output (strip ANSI, warnings, spinners)
        const raw = (stderr || stdout || 'unknown error').trim();
        const lines = raw.split('\n').filter((l) => {
          const t = l.replace(/\x1b\[[^a-zA-Z]*[a-zA-Z]/g, '').trim();
          return t && !t.startsWith('(') && !t.startsWith('-') && !t.startsWith('✖');
        });
        const errorLine = lines.find((l) => /error/i.test(l)) ?? lines[lines.length - 1] ?? raw;
        throw new Error(errorLine.replace(/\x1b\[[^a-zA-Z]*[a-zA-Z]/g, '').trim());
      }

      // clawhub installs to {workdir}/skills/{slug}/
      const installedPath = join(tmpBase, 'skills', slug);
      try {
        await stat(join(installedPath, 'SKILL.md'));
      } catch {
        // Slug might differ from directory name — scan for SKILL.md
        const skillsDir = join(tmpBase, 'skills');
        const entries = await readdir(skillsDir).catch(() => [] as string[]);
        let found = false;
        for (const entry of entries) {
          const candidate = join(skillsDir, entry, 'SKILL.md');
          try {
            await stat(candidate);
            // Found it — use this path
            await mkdir(destDir, { recursive: true });
            await cp(join(skillsDir, entry), destDir, { recursive: true });
            found = true;
            break;
          } catch {}
        }
        if (!found) throw new Error(`Installed skill has no SKILL.md`);

        // Read version from _meta.json if present
        const version = await readMeta(destDir);
        return { name: slug, version };
      }

      // Copy the installed skill to the real destination
      await mkdir(destDir, { recursive: true });
      await cp(installedPath, destDir, { recursive: true });

      const version = await readMeta(destDir);
      return { name: slug, version };
    } finally {
      await rm(tmpBase, { recursive: true, force: true }).catch(() => {});
    }
  }
}

async function readMeta(skillDir: string): Promise<string> {
  try {
    const raw = await readFile(join(skillDir, '_meta.json'), 'utf-8');
    const meta = JSON.parse(raw);
    return meta.version ?? 'latest';
  } catch {
    return 'latest';
  }
}

// ---------------------------------------------------------------------------
// skills.sh helpers
// ---------------------------------------------------------------------------

/** Strip ANSI escape sequences from CLI output. */
function stripAnsiCodes(s: string): string {
  return s.replace(/\x1b\[[^a-zA-Z]*[a-zA-Z]/g, '');
}

/**
 * Parse `npx skills search` output.
 *
 * Each result is two lines:
 *   owner/repo@skill  NNK installs
 *   └ https://skills.sh/owner/repo/skill
 */
function parseSkillsShOutput(stdout: string): SkillSearchResult[] {
  const clean = stripAnsiCodes(stdout);
  const results: SkillSearchResult[] = [];

  // Match lines like: owner/repo@skill  123K installs
  const lineRe = /^([\w.-]+\/[\w.-]+@[\w.-]+)\s+(.+?installs?)\s*$/;

  for (const line of clean.split('\n')) {
    const trimmed = line.trim();
    const m = trimmed.match(lineRe);
    if (!m) continue;

    const slug = m[1]; // owner/repo@skill
    const installStr = m[2]; // "98.5K installs"

    // Parse download count: "98.5K" → 98500, "2.1M" → 2100000
    let downloads: number | undefined;
    const numMatch = installStr.match(/([\d.]+)([KMkm]?)/);
    if (numMatch) {
      const n = parseFloat(numMatch[1]);
      const suffix = (numMatch[2] || '').toUpperCase();
      downloads = Math.round(suffix === 'K' ? n * 1000 : suffix === 'M' ? n * 1_000_000 : n);
    }

    // Extract skill name from slug: "owner/repo@skill" → "skill"
    const atIdx = slug.indexOf('@');
    const name = atIdx >= 0 ? slug.slice(atIdx + 1) : slug;

    results.push({
      slug,
      name,
      description: '',
      downloads,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// skills.sh implementation
// ---------------------------------------------------------------------------

/**
 * Registry backed by skills.sh — a community skill ecosystem.
 *
 * Uses `npx skills` CLI commands:
 *   - `npx skills search <query>` → ANSI-formatted text output
 *   - `npx skills add <owner>/<repo>@<skill>` → installs to cwd/skills/
 *
 * No global install required — npx handles fetching.
 */
export class SkillsShRegistry implements SkillRegistry {
  readonly name = 'skills.sh';

  isAvailable(): boolean {
    // npx is available wherever npm is installed — always true
    return isOnPath('npx');
  }

  async search(query: string, limit = 10): Promise<SkillSearchResult[]> {
    const { stdout, code } = await runCli('npx', ['-y', 'skills', 'search', query], { timeout: 30_000 });

    if (code !== 0) return [];

    return parseSkillsShOutput(stdout).slice(0, limit);
  }

  async install(slug: string, destDir: string): Promise<SkillInstallResult> {
    // slug can be:
    //   owner/repo/skill  →  npx skills add owner/repo@skill
    //   owner/repo@skill  →  npx skills add owner/repo@skill (pass through)
    let installSlug: string;
    let skillName: string;

    if (slug.includes('@')) {
      // Already in owner/repo@skill format
      installSlug = slug;
      skillName = slug.slice(slug.indexOf('@') + 1);
    } else {
      const parts = slug.split('/');
      if (parts.length < 2) {
        throw new Error(`Invalid skills.sh slug: ${slug}. Expected format: owner/repo/skill or owner/repo@skill`);
      }
      skillName = parts[2] ?? parts[1];
      installSlug = parts[2] ? `${parts[0]}/${parts[1]}@${parts[2]}` : `${parts[0]}/${parts[1]}`;
    }

    const tmpBase = join(tmpdir(), `golem-skillssh-${Date.now()}`);
    await mkdir(tmpBase, { recursive: true });

    try {
      const args = ['-y', 'skills', 'add', installSlug, '-y'];

      const { stdout, stderr, code } = await runCli('npx', args, {
        cwd: tmpBase,
        timeout: 60_000,
      });

      if (code !== 0) {
        const raw = stripAnsiCodes((stderr || stdout || 'unknown error').trim());
        throw new Error(raw.split('\n').pop() ?? raw);
      }

      // `npx skills add` installs to .agents/skills/<name>/ (universal agents dir)
      // Also check skills/<name>/ and .claude/skills/<name>/ as fallbacks
      const candidateDirs = [
        join(tmpBase, '.agents', 'skills'),
        join(tmpBase, 'skills'),
        join(tmpBase, '.claude', 'skills'),
      ];

      let sourceDir: string | null = null;
      for (const base of candidateDirs) {
        const entries = await readdir(base).catch(() => [] as string[]);
        if (entries.includes(skillName)) {
          sourceDir = join(base, skillName);
          break;
        }
        // Fallback: use first entry if only one
        if (entries.length === 1) {
          sourceDir = join(base, entries[0]);
          break;
        }
      }

      if (!sourceDir) {
        throw new Error(`No skill found after install for slug: ${slug}`);
      }

      await mkdir(destDir, { recursive: true });
      await cp(sourceDir, destDir, { recursive: true });

      const version = await readMeta(destDir);
      return { name: skillName, version };
    } finally {
      await rm(tmpBase, { recursive: true, force: true }).catch(() => {});
    }
  }
}

// ---------------------------------------------------------------------------
// Registry factory
// ---------------------------------------------------------------------------

const REGISTRIES: Record<string, () => SkillRegistry> = {
  clawhub: () => new ClawHubRegistry(),
  'skills.sh': () => new SkillsShRegistry(),
};

export function getRegistry(name: string): SkillRegistry | undefined {
  return REGISTRIES[name]?.();
}

export function listRegistries(): string[] {
  return Object.keys(REGISTRIES);
}
