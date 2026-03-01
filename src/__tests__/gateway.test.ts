import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { ChannelAdapter, ChannelMessage } from '../channel.js';

function createMockAdapter(name: string): ChannelAdapter & {
  messages: ChannelMessage[];
  replies: Array<{ msg: ChannelMessage; text: string }>;
  triggerMessage: (msg: ChannelMessage) => void;
} {
  let onMessage: ((msg: ChannelMessage) => void) | null = null;
  const adapter = {
    name,
    messages: [] as ChannelMessage[],
    replies: [] as Array<{ msg: ChannelMessage; text: string }>,
    triggerMessage(msg: ChannelMessage) {
      if (onMessage) onMessage(msg);
    },
    async start(cb: (msg: ChannelMessage) => void) {
      onMessage = cb;
    },
    async reply(msg: ChannelMessage, text: string) {
      adapter.replies.push({ msg, text });
    },
    async stop() {
      onMessage = null;
    },
  };
  return adapter;
}

describe('ChannelAdapter mock', () => {
  it('receives messages and sends replies through adapter', async () => {
    const adapter = createMockAdapter('test');

    const received: ChannelMessage[] = [];
    await adapter.start((msg) => {
      received.push(msg);
    });

    const testMsg: ChannelMessage = {
      channelType: 'test',
      senderId: 'user1',
      chatId: 'chat1',
      chatType: 'dm',
      text: 'hello',
      raw: {},
    };

    adapter.triggerMessage(testMsg);
    expect(received).toHaveLength(1);
    expect(received[0].text).toBe('hello');

    await adapter.reply(testMsg, 'world');
    expect(adapter.replies).toHaveLength(1);
    expect(adapter.replies[0].text).toBe('world');

    await adapter.stop();
    adapter.triggerMessage(testMsg);
    expect(received).toHaveLength(1);
  });
});

describe('Gateway config loading', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'golem-gw-'));
    await mkdir(join(tmpDir, 'skills', 'general'), { recursive: true });
    await writeFile(
      join(tmpDir, 'skills', 'general', 'SKILL.md'),
      '---\nname: general\ndescription: test\n---\n# Test\n',
      'utf-8',
    );
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('loads gateway config from golem.yaml', async () => {
    const { loadConfig } = await import('../workspace.js');
    await writeFile(
      join(tmpDir, 'golem.yaml'),
      'name: gw-test\nengine: cursor\ngateway:\n  port: 4567\n  token: secret\n',
      'utf-8',
    );
    const config = await loadConfig(tmpDir);
    expect(config.gateway?.port).toBe(4567);
    expect(config.gateway?.token).toBe('secret');
  });

  it('starts without channels (HTTP only)', async () => {
    const { loadConfig } = await import('../workspace.js');
    await writeFile(
      join(tmpDir, 'golem.yaml'),
      'name: gw-test\nengine: cursor\n',
      'utf-8',
    );
    const config = await loadConfig(tmpDir);
    expect(config.channels).toBeUndefined();
  });
});

describe('initWorkspace installs im-adapter skill', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'golem-init-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('creates both general and im-adapter skills', async () => {
    const { initWorkspace, scanSkills } = await import('../workspace.js');
    const builtinDir = join(process.cwd(), 'skills');
    await initWorkspace(tmpDir, { name: 'test', engine: 'cursor' }, builtinDir);

    const skills = await scanSkills(tmpDir);
    const names = skills.map(s => s.name).sort();
    expect(names).toContain('general');
    expect(names).toContain('im-adapter');
  });
});
