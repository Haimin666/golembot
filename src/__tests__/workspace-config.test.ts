import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type GolemConfig, loadConfig, patchConfigFull, resolveEnvPlaceholders, writeConfig } from '../workspace.js';

describe('resolveEnvPlaceholders', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, MY_SECRET: 'secret123', MY_ID: 'id456' };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it('resolves ${ENV_VAR} in strings', () => {
    expect(resolveEnvPlaceholders('prefix_${MY_SECRET}_suffix')).toBe('prefix_secret123_suffix');
  });

  it('leaves unresolved placeholders if env var missing', () => {
    expect(resolveEnvPlaceholders('${NONEXISTENT}')).toBe('${NONEXISTENT}');
  });

  it('resolves nested objects', () => {
    const result = resolveEnvPlaceholders({
      appId: '${MY_ID}',
      appSecret: '${MY_SECRET}',
      nested: { key: '${MY_ID}' },
    });
    expect(result).toEqual({
      appId: 'id456',
      appSecret: 'secret123',
      nested: { key: 'id456' },
    });
  });

  it('returns non-string primitives unchanged', () => {
    expect(resolveEnvPlaceholders(42)).toBe(42);
    expect(resolveEnvPlaceholders(true)).toBe(true);
    expect(resolveEnvPlaceholders(null)).toBe(null);
  });
});

describe('loadConfig with channels + gateway', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'golem-config-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('parses channels and gateway from golem.yaml', async () => {
    const yamlContent = `
name: test-bot
engine: claude-code
model: openrouter/anthropic/claude-sonnet-4
channels:
  feishu:
    appId: cli_xxx
    appSecret: secret_xxx
  dingtalk:
    clientId: din_xxx
    clientSecret: din_secret
gateway:
  port: 4000
  host: 0.0.0.0
  token: my-token
`;
    await writeFile(join(tmpDir, 'golem.yaml'), yamlContent, 'utf-8');
    const config = await loadConfig(tmpDir);

    expect(config.name).toBe('test-bot');
    expect(config.engine).toBe('claude-code');
    expect(config.channels?.feishu?.appId).toBe('cli_xxx');
    expect(config.channels?.dingtalk?.clientId).toBe('din_xxx');
    expect(config.gateway?.port).toBe(4000);
    expect(config.gateway?.host).toBe('0.0.0.0');
    expect(config.gateway?.token).toBe('my-token');
  });

  it('loads config without channels (backward compatible)', async () => {
    const yamlContent = `
name: simple-bot
engine: cursor
`;
    await writeFile(join(tmpDir, 'golem.yaml'), yamlContent, 'utf-8');
    const config = await loadConfig(tmpDir);

    expect(config.name).toBe('simple-bot');
    expect(config.channels).toBeUndefined();
    expect(config.gateway).toBeUndefined();
  });

  it('resolves ${ENV_VAR} in channel configs', async () => {
    process.env.TEST_FEISHU_ID = 'resolved_id';
    process.env.TEST_FEISHU_SECRET = 'resolved_secret';

    const yamlContent = `
name: env-bot
engine: claude-code
channels:
  feishu:
    appId: \${TEST_FEISHU_ID}
    appSecret: \${TEST_FEISHU_SECRET}
`;
    await writeFile(join(tmpDir, 'golem.yaml'), yamlContent, 'utf-8');
    const config = await loadConfig(tmpDir);

    expect(config.channels?.feishu?.appId).toBe('resolved_id');
    expect(config.channels?.feishu?.appSecret).toBe('resolved_secret');

    delete process.env.TEST_FEISHU_ID;
    delete process.env.TEST_FEISHU_SECRET;
  });
});

describe('loadConfig groupChat field', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'golem-gc-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('parses groupChat from golem.yaml', async () => {
    await writeFile(
      join(tmpDir, 'golem.yaml'),
      'name: bot\nengine: cursor\ngroupChat:\n  groupPolicy: smart\n  historyLimit: 30\n  maxTurns: 5\n',
      'utf-8',
    );
    const config = await loadConfig(tmpDir);
    expect(config.groupChat?.groupPolicy).toBe('smart');
    expect(config.groupChat?.historyLimit).toBe(30);
    expect(config.groupChat?.maxTurns).toBe(5);
  });

  it('leaves groupChat undefined when absent', async () => {
    await writeFile(join(tmpDir, 'golem.yaml'), 'name: bot\nengine: cursor\n', 'utf-8');
    const config = await loadConfig(tmpDir);
    expect(config.groupChat).toBeUndefined();
  });
});

describe('writeConfig with channels + gateway', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'golem-write-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('round-trips channels and gateway', async () => {
    const config: GolemConfig = {
      name: 'round-trip',
      engine: 'opencode',
      channels: {
        feishu: { appId: 'cli_abc', appSecret: 'sec_abc' },
      },
      gateway: { port: 5000, token: 'tok' },
    };

    await writeConfig(tmpDir, config);
    const loaded = await loadConfig(tmpDir);

    expect(loaded.channels?.feishu?.appId).toBe('cli_abc');
    expect(loaded.gateway?.port).toBe(5000);
    expect(loaded.gateway?.token).toBe('tok');
  });

  it('round-trips groupChat config', async () => {
    const config: GolemConfig = {
      name: 'bot',
      engine: 'cursor',
      groupChat: { groupPolicy: 'smart', historyLimit: 25, maxTurns: 8 },
    };

    await writeConfig(tmpDir, config);
    const loaded = await loadConfig(tmpDir);

    expect(loaded.groupChat?.groupPolicy).toBe('smart');
    expect(loaded.groupChat?.historyLimit).toBe(25);
    expect(loaded.groupChat?.maxTurns).toBe(8);
  });
});

describe('patchConfigFull', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'golem-patch-'));
    await writeFile(
      join(tmpDir, 'golem.yaml'),
      'name: patch-bot\nengine: cursor\ntimeout: 300\ngroupChat:\n  groupPolicy: mention-only\n  historyLimit: 20\n',
      'utf-8',
    );
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('deep-merges nested objects preserving unpatched fields', async () => {
    const result = await patchConfigFull(tmpDir, { groupChat: { maxTurns: 5 } });
    expect(result.config.groupChat?.groupPolicy).toBe('mention-only');
    expect(result.config.groupChat?.historyLimit).toBe(20);
    expect(result.config.groupChat?.maxTurns).toBe(5);
    expect(result.config.name).toBe('patch-bot');
  });

  it('preserves fields not in the patch', async () => {
    const result = await patchConfigFull(tmpDir, { timeout: 600 });
    expect(result.config.timeout).toBe(600);
    expect(result.config.engine).toBe('cursor');
    expect(result.config.groupChat?.groupPolicy).toBe('mention-only');
  });

  it('returns needsRestart=true for engine change', async () => {
    const result = await patchConfigFull(tmpDir, { engine: 'opencode' });
    expect(result.needsRestart).toBe(true);
  });

  it('returns needsRestart=true for codex config change', async () => {
    const result = await patchConfigFull(tmpDir, { codex: { mode: 'safe' } });
    expect(result.needsRestart).toBe(true);
  });

  it('returns needsRestart=false for hot-reloadable fields', async () => {
    const result = await patchConfigFull(tmpDir, { timeout: 600, sessionTtlDays: 7 });
    expect(result.needsRestart).toBe(false);
  });

  it('throws when name is removed', async () => {
    await expect(patchConfigFull(tmpDir, { name: '' })).rejects.toThrow('name');
  });

  it('throws when engine is removed', async () => {
    await expect(patchConfigFull(tmpDir, { engine: '' })).rejects.toThrow('engine');
  });

  it('persists changes to golem.yaml', async () => {
    await patchConfigFull(tmpDir, { model: 'gpt-4o', timeout: 120 });
    const loaded = await loadConfig(tmpDir);
    expect(loaded.model).toBe('gpt-4o');
    expect(loaded.timeout).toBe(120);
  });
});
