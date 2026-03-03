/**
 * MockGroupAdapter — shared in-memory group channel for multi-bot demos.
 *
 * All adapter instances sharing the same `groupEmitter` are connected to the
 * same "room". When any bot calls reply(), the message is broadcast back to
 * every other adapter so they can "see" it, simulating a real group chat.
 */

import { EventEmitter } from 'node:events';

/** Shared event bus — one per "group room". Pass the same instance to all bots. */
export class GroupRoom extends EventEmitter {}

export default class MockGroupAdapter {
  /**
   * @param {object} config
   * @param {GroupRoom} config.room   - Shared GroupRoom instance
   * @param {string}    config.botName - Bot's display name (used to filter its own echoes)
   * @param {string}   [config.channelName] - Channel name override
   */
  constructor(config) {
    this.name = config.channelName ?? 'mock-group';
    this.botName = config.botName ?? 'bot';
    this.room = config.room;
    this._onMessage = null;
  }

  async start(onMessage) {
    this._onMessage = onMessage;
    this.room.on('message', (msg) => {
      // Don't echo the bot's own messages back to itself
      if (msg.senderName === this.botName) return;
      if (this._onMessage) this._onMessage(msg);
    });
  }

  async reply(originalMsg, text) {
    const replyMsg = {
      channelType: 'mock-group',
      chatId: originalMsg.chatId,
      chatType: 'group',
      senderId: this.botName,
      senderName: this.botName,
      text,
      raw: {},
    };
    // Broadcast the bot's reply back into the room
    this.room.emit('message', replyMsg);
    // Also print it to stdout for the demo
    console.log(`  [${this.botName}] ${text}`);
  }

  async stop() {
    this._onMessage = null;
    this.room.removeAllListeners('message');
  }

  /**
   * Inject a human message into the room.
   * @param {string} senderName
   * @param {string} text
   * @param {string} chatId
   */
  injectMessage(senderName, text, chatId = 'demo-room') {
    const msg = {
      channelType: 'mock-group',
      chatId,
      chatType: 'group',
      senderId: senderName,
      senderName,
      text,
      raw: {},
    };
    this.room.emit('message', msg);
  }
}
