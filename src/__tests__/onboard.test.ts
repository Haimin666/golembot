import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { generateEnvExample, installTemplate } from '../onboard.js';

describe('onboard', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'golem-onboard-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  // ── generateEnvExample ─────────────────────────

  describe('generateEnvExample', () => {
    it('generates Cursor engine template with no channels', () => {
      const result = generateEnvExample('cursor', []);
      expect(result).toContain('CURSOR_API_KEY=crsr_');
      expect(result).toContain('GOLEM_TOKEN');
      expect(result).not.toContain('FEISHU');
      expect(result).not.toContain('DINGTALK');
      expect(result).not.toContain('WECOM');
    });

    it('generates Claude Code engine template', () => {
      const result = generateEnvExample('claude-code', []);
      expect(result).toContain('ANTHROPIC_API_KEY=sk-ant-');
      expect(result).not.toContain('CURSOR_API_KEY');
    });

    it('generates OpenCode engine template', () => {
      const result = generateEnvExample('opencode', []);
      expect(result).toContain('OPENROUTER_API_KEY=sk-or-');
    });

    it('includes Feishu env vars when feishu is selected', () => {
      const result = generateEnvExample('cursor', ['feishu']);
      expect(result).toContain('FEISHU_APP_ID');
      expect(result).toContain('FEISHU_APP_SECRET');
    });

    it('includes DingTalk env vars when dingtalk is selected', () => {
      const result = generateEnvExample('cursor', ['dingtalk']);
      expect(result).toContain('DINGTALK_CLIENT_ID');
      expect(result).toContain('DINGTALK_CLIENT_SECRET');
    });

    it('includes WeCom env vars when wecom is selected', () => {
      const result = generateEnvExample('cursor', ['wecom']);
      expect(result).toContain('WECOM_CORP_ID');
      expect(result).toContain('WECOM_AGENT_ID');
      expect(result).toContain('WECOM_SECRET');
      expect(result).toContain('WECOM_TOKEN');
      expect(result).toContain('WECOM_ENCODING_AES_KEY');
    });

    it('includes Slack env vars when slack is selected', () => {
      const result = generateEnvExample('cursor', ['slack']);
      expect(result).toContain('SLACK_BOT_TOKEN');
      expect(result).toContain('SLACK_APP_TOKEN');
    });

    it('includes Telegram env var when telegram is selected', () => {
      const result = generateEnvExample('cursor', ['telegram']);
      expect(result).toContain('TELEGRAM_BOT_TOKEN');
    });

    it('includes Discord env var when discord is selected', () => {
      const result = generateEnvExample('cursor', ['discord']);
      expect(result).toContain('DISCORD_BOT_TOKEN');
    });

    it('includes all channel env vars when all 6 channels are selected', () => {
      const result = generateEnvExample('claude-code', ['feishu', 'dingtalk', 'wecom', 'slack', 'telegram', 'discord']);
      expect(result).toContain('ANTHROPIC_API_KEY');
      expect(result).toContain('FEISHU_APP_ID');
      expect(result).toContain('DINGTALK_CLIENT_ID');
      expect(result).toContain('WECOM_CORP_ID');
      expect(result).toContain('SLACK_BOT_TOKEN');
      expect(result).toContain('SLACK_APP_TOKEN');
      expect(result).toContain('TELEGRAM_BOT_TOKEN');
      expect(result).toContain('DISCORD_BOT_TOKEN');
      expect(result).toContain('GOLEM_TOKEN');
    });
  });

  // ── installTemplate ────────────────────────────

  describe('installTemplate', () => {
    let templatesBase: string;

    beforeEach(async () => {
      templatesBase = join(dir, '_templates');
    });

    it('copies skills from template to target directory', async () => {
      const templateDir = join(templatesBase, 'test-tpl');
      const skillDir = join(templateDir, 'skills', 'my-skill');
      await mkdir(skillDir, { recursive: true });
      await writeFile(join(skillDir, 'SKILL.md'), '---\nname: my-skill\n---\n# Test\n');

      const targetDir = join(dir, 'target');
      await mkdir(join(targetDir, 'skills'), { recursive: true });

      await installTemplate(targetDir, 'test-tpl', templatesBase);

      const copied = await readFile(join(targetDir, 'skills', 'my-skill', 'SKILL.md'), 'utf-8');
      expect(copied).toContain('my-skill');
    });

    it('copies README.md from template', async () => {
      const templateDir = join(templatesBase, 'readme-tpl');
      await mkdir(join(templateDir, 'skills'), { recursive: true });
      await writeFile(join(templateDir, 'README.md'), '# Test Template\n');

      const targetDir = join(dir, 'target2');
      await mkdir(join(targetDir, 'skills'), { recursive: true });

      await installTemplate(targetDir, 'readme-tpl', templatesBase);

      const readme = await readFile(join(targetDir, 'README.md'), 'utf-8');
      expect(readme).toContain('Test Template');
    });

    it('does not overwrite existing skills', async () => {
      const templateDir = join(templatesBase, 'conflict-tpl');
      const skillDir = join(templateDir, 'skills', 'existing');
      await mkdir(skillDir, { recursive: true });
      await writeFile(join(skillDir, 'SKILL.md'), 'template version');

      const targetDir = join(dir, 'target3');
      const existingSkill = join(targetDir, 'skills', 'existing');
      await mkdir(existingSkill, { recursive: true });
      await writeFile(join(existingSkill, 'SKILL.md'), 'original version');

      await installTemplate(targetDir, 'conflict-tpl', templatesBase);

      const content = await readFile(join(existingSkill, 'SKILL.md'), 'utf-8');
      expect(content).toBe('original version');
    });

    it('does not overwrite existing README.md', async () => {
      const templateDir = join(templatesBase, 'readme-conflict');
      await mkdir(join(templateDir, 'skills'), { recursive: true });
      await writeFile(join(templateDir, 'README.md'), 'template readme');

      const targetDir = join(dir, 'target4');
      await mkdir(join(targetDir, 'skills'), { recursive: true });
      await writeFile(join(targetDir, 'README.md'), 'existing readme');

      await installTemplate(targetDir, 'readme-conflict', templatesBase);

      const readme = await readFile(join(targetDir, 'README.md'), 'utf-8');
      expect(readme).toBe('existing readme');
    });

    it('handles nonexistent template gracefully', async () => {
      const targetDir = join(dir, 'target5');
      await mkdir(targetDir, { recursive: true });

      // Should not throw
      await installTemplate(targetDir, 'nonexistent', templatesBase);
    });

    it('handles template with no skills directory', async () => {
      const templateDir = join(templatesBase, 'no-skills');
      await mkdir(templateDir, { recursive: true });
      await writeFile(join(templateDir, 'README.md'), '# No Skills\n');

      const targetDir = join(dir, 'target6');
      await mkdir(join(targetDir, 'skills'), { recursive: true });

      await installTemplate(targetDir, 'no-skills', templatesBase);

      const readme = await readFile(join(targetDir, 'README.md'), 'utf-8');
      expect(readme).toContain('No Skills');
    });

    it('copies multiple skills from a template', async () => {
      const templateDir = join(templatesBase, 'multi-skill');
      for (const name of ['alpha', 'beta', 'gamma']) {
        const sd = join(templateDir, 'skills', name);
        await mkdir(sd, { recursive: true });
        await writeFile(join(sd, 'SKILL.md'), `# ${name}\n`);
      }

      const targetDir = join(dir, 'target7');
      await mkdir(join(targetDir, 'skills'), { recursive: true });

      await installTemplate(targetDir, 'multi-skill', templatesBase);

      const entries = await readdir(join(targetDir, 'skills'));
      expect(entries).toContain('alpha');
      expect(entries).toContain('beta');
      expect(entries).toContain('gamma');
    });
  });
});
