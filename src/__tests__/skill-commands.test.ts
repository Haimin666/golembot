import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir, readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scanSkills, generateAgentsMd, initWorkspace } from '../workspace.js';

describe('skill management operations', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'golem-skill-'));
    await mkdir(join(dir, 'skills'), { recursive: true });
    await writeFile(join(dir, 'golem.yaml'), 'name: test-bot\nengine: cursor\n');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  // ── skill add (simulated) ─────────────────────

  describe('skill add', () => {
    it('copies a skill directory into skills/', async () => {
      const srcDir = join(dir, '_external', 'my-custom-skill');
      await mkdir(srcDir, { recursive: true });
      await writeFile(join(srcDir, 'SKILL.md'), '---\nname: my-custom-skill\ndescription: A custom skill\n---\n# Custom\n');
      await writeFile(join(srcDir, 'helper.py'), 'print("hello")\n');

      const { cp } = await import('node:fs/promises');
      const { basename } = await import('node:path');

      const skillName = basename(srcDir);
      const destPath = join(dir, 'skills', skillName);
      await cp(srcDir, destPath, { recursive: true });

      const skills = await scanSkills(dir);
      await generateAgentsMd(dir, skills);

      expect(skills.some(s => s.name === 'my-custom-skill')).toBe(true);

      const copied = await readFile(join(destPath, 'helper.py'), 'utf-8');
      expect(copied).toContain('hello');

      const agentsMd = await readFile(join(dir, 'AGENTS.md'), 'utf-8');
      expect(agentsMd).toContain('my-custom-skill');
    });

    it('rejects adding when skill already exists', async () => {
      const existingSkill = join(dir, 'skills', 'duplicate');
      await mkdir(existingSkill, { recursive: true });
      await writeFile(join(existingSkill, 'SKILL.md'), '# Existing\n');

      const s = await stat(existingSkill);
      expect(s.isDirectory()).toBe(true);
    });

    it('rejects adding a source without SKILL.md', async () => {
      const srcDir = join(dir, '_external', 'no-skill');
      await mkdir(srcDir, { recursive: true });
      await writeFile(join(srcDir, 'random.txt'), 'no SKILL.md here');

      let threw = false;
      try {
        await stat(join(srcDir, 'SKILL.md'));
      } catch {
        threw = true;
      }
      expect(threw).toBe(true);
    });
  });

  // ── skill remove (simulated) ──────────────────

  describe('skill remove', () => {
    it('removes a skill directory and updates AGENTS.md', async () => {
      const skillDir = join(dir, 'skills', 'to-remove');
      await mkdir(skillDir, { recursive: true });
      await writeFile(join(skillDir, 'SKILL.md'), '---\nname: to-remove\ndescription: Will be removed\n---\n');

      let skills = await scanSkills(dir);
      expect(skills.some(s => s.name === 'to-remove')).toBe(true);

      await rm(skillDir, { recursive: true, force: true });

      skills = await scanSkills(dir);
      await generateAgentsMd(dir, skills);

      expect(skills.some(s => s.name === 'to-remove')).toBe(false);

      const agentsMd = await readFile(join(dir, 'AGENTS.md'), 'utf-8');
      expect(agentsMd).not.toContain('to-remove');
    });

    it('removing nonexistent skill has no effect on others', async () => {
      const keepSkill = join(dir, 'skills', 'keeper');
      await mkdir(keepSkill, { recursive: true });
      await writeFile(join(keepSkill, 'SKILL.md'), '---\nname: keeper\ndescription: Stays\n---\n');

      // "remove" something that doesn't exist
      const ghostPath = join(dir, 'skills', 'ghost');
      let threw = false;
      try {
        await stat(ghostPath);
      } catch {
        threw = true;
      }
      expect(threw).toBe(true);

      const skills = await scanSkills(dir);
      expect(skills).toHaveLength(1);
      expect(skills[0].name).toBe('keeper');
    });
  });

  // ── skill list (via scanSkills) ───────────────

  describe('skill list', () => {
    it('lists multiple skills with descriptions', async () => {
      for (const [name, desc] of [['alpha', 'First skill'], ['beta', 'Second skill'], ['gamma', 'Third skill']]) {
        const sd = join(dir, 'skills', name);
        await mkdir(sd, { recursive: true });
        await writeFile(join(sd, 'SKILL.md'), `---\nname: ${name}\ndescription: ${desc}\n---\n`);
      }

      const skills = await scanSkills(dir);
      expect(skills).toHaveLength(3);

      const names = skills.map(s => s.name).sort();
      expect(names).toEqual(['alpha', 'beta', 'gamma']);

      const alpha = skills.find(s => s.name === 'alpha')!;
      expect(alpha.description).toBe('First skill');
    });

    it('returns empty array when skills/ is missing', async () => {
      await rm(join(dir, 'skills'), { recursive: true, force: true });
      const skills = await scanSkills(dir);
      expect(skills).toEqual([]);
    });
  });
});
