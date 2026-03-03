# IM Channel Integration Test Playbook

This document is the manual test companion to the automated `gateway-integration.test.ts` suite.
It covers real-world IM scenarios that require actual bot accounts, live group chats, and a real
AI engine (claude-code or similar).

---

## Prerequisites

Before running any platform tests:

1. **Start the bot** with a real engine and all channels configured:
   ```bash
   golem gateway --dir ./my-bot --verbose
   ```
   Use `--verbose` so you can see every message received and reply sent in the terminal.

2. **golem.yaml baseline** (adjust per platform under test):
   ```yaml
   name: golem-test
   engine: claude-code

   groupChat:
     groupPolicy: mention-only   # change per test section
     historyLimit: 20
     maxTurns: 10
   ```

3. **Test group setup**: For each platform, create a dedicated test group/channel containing:
   - You (the human tester)
   - The bot account
   - Optionally a second human account (for multi-user tests)

---

## Platform A — Telegram

### Setup
- Bot token: `TELEGRAM_BOT_TOKEN`
- Create a test group, add the bot
- For group tests, the bot must be an administrator (to read messages)
- Optionally enable privacy mode OFF in @BotFather → bot can read all messages

### Test Cases

#### A-1 · DM Basic Flow
| Step | Action | Expected |
|------|--------|----------|
| 1 | Open DM with bot, send: `What is 2+2?` | Bot replies within 30s |
| 2 | Send: `What did I just ask you?` | Bot recalls the previous question (session continuity) |
| 3 | Verify terminal shows: `received from <you>: "What is 2+2?"` | ✓ verbose log |

#### A-2 · DM Long Reply Splitting
| Step | Action | Expected |
|------|--------|----------|
| 1 | Send: `Write a 500-word essay about clouds` | Bot sends multiple Telegram messages, each ≤ 4096 chars |
| 2 | Verify all messages arrive in sequence | No truncation, natural split points |

#### A-3 · Group — mention-only (default)
| Step | Action | Expected |
|------|--------|----------|
| 1 | In test group, send: `hello everyone` | Bot does NOT reply (no mention) |
| 2 | Check terminal | Should show no "received" log for this message |
| 3 | Send: `@golem-test hello` | Bot replies |
| 4 | Terminal shows mention detection | `session key = telegram:CHAT_ID` (no user ID) |

#### A-4 · Group — smart mode
Change config to `groupPolicy: smart`, restart bot.
| Step | Action | Expected |
|------|--------|----------|
| 1 | Send: `We decided to use PostgreSQL for the new project` | Bot may reply (smart) or stay silent ([PASS]) |
| 2 | Send: `@golem-test what database are we using?` | Bot answers "PostgreSQL" (used group context) |
| 3 | Check terminal for `[PASS]` log | Should appear for messages bot chose to skip |

#### A-5 · Group — maxTurns protection
Change config to `maxTurns: 3`, `groupPolicy: always`, restart bot.
| Step | Action | Expected |
|------|--------|----------|
| 1 | Send 4 messages in a row (any text) | Bot replies to first 3, stays silent on 4th |
| 2 | Terminal shows: `maxTurns (3) reached` | ✓ |
| 3 | Call `POST /reset` with `sessionKey: "telegram:CHAT_ID"` | Group state cleared |
| 4 | Send another message | Bot replies again |

#### A-6 · /reset via HTTP API
```bash
curl -X POST http://localhost:3000/reset \
  -H "Content-Type: application/json" \
  -d '{"sessionKey": "telegram:YOUR_CHAT_ID"}'
```
Expected: `{"ok": true}`. Then send a DM — bot has no memory of previous conversation.

---

## Platform B — Discord

### Setup
- Bot token: `DISCORD_BOT_TOKEN`
- Enable **Message Content Intent** in Discord Developer Portal (required for reading messages)
- `botName` in config is optional — mention detection works via `<@botId>` natively

### Test Cases

#### B-1 · DM Basic Flow
Same as A-1 (verify DM session key = `discord:dm-USER_ID`)

#### B-2 · Group — @mention without botName configured
This tests the `msg.mentioned` field path (Discord-native detection):
| Step | Action | Expected |
|------|--------|----------|
| 1 | Set `botName: ""` or omit `botName` in channel config | |
| 2 | In server channel, send: `<@BOT_USER_ID> hello` | Bot replies (mention detected natively even without botName) |
| 3 | Send: `hello without mention` | Bot silent (mention-only mode) |

#### B-3 · Group — @mention with botName configured
| Step | Action | Expected |
|------|--------|----------|
| 1 | Set `botName: "golem-test"` in config | |
| 2 | Send: `@golem-test help me` | Bot replies |
| 3 | Terminal: prompt should NOT have `<@userId>` token | Normalized to `@golem-test` |

#### B-4 · Message length limit (2000 chars)
| Step | Action | Expected |
|------|--------|----------|
| 1 | Ask: `Write a detailed 3000-character story` | Bot sends ≥2 Discord messages, each ≤2000 chars |
| 2 | Both messages arrive | No Discord "message too long" error |

#### B-5 · Bot self-echo prevention
| Step | Action | Expected |
|------|--------|----------|
| 1 | Set `groupPolicy: smart`, ensure bot's Discord username matches `config.name` | |
| 2 | Ask bot something; when bot replies, verify bot's own reply doesn't trigger another response | No infinite loop |

---

## Platform C — Slack

### Setup
- `SLACK_BOT_TOKEN` (Bot User OAuth Token, `xoxb-...`)
- `SLACK_APP_TOKEN` (Socket Mode token, `xapp-...`)
- Socket Mode must be enabled in app settings
- Bot must be invited to the test channel: `/invite @golem-test`

### Test Cases

#### C-1 · DM Basic Flow
| Step | Action | Expected |
|------|--------|----------|
| 1 | DM the bot: `tell me a joke` | Bot replies |
| 2 | DM session key format: `slack:DM_CHANNEL_ID:USER_ID` | Check terminal |

#### C-2 · Channel — mention-only
| Step | Action | Expected |
|------|--------|----------|
| 1 | In test channel, post: `good morning team` | Bot silent |
| 2 | Post: `<@BOT_USER_ID> what's the weather like?` (Slack native mention) | Bot replies |
| 3 | Post: `@golem-test what's 2+2?` (text mention) | Bot replies |

#### C-3 · Thread replies
> **Note**: Current adapter replies in-channel, not in thread. This is a known behavior.
| Step | Action | Expected |
|------|--------|----------|
| 1 | In a thread, @mention the bot | Bot replies to the thread (or top-level depending on adapter) |

#### C-4 · Multiple users, shared group session
| Step | Action | Expected |
|------|--------|----------|
| 1 | User A says `@golem-test my name is Alice` | Bot acknowledges |
| 2 | User B says `@golem-test what is Alice's name?` | Bot answers correctly (shared session) |
| 3 | Terminal: both messages use session key `slack:CHANNEL_ID` (no user suffix) | ✓ |

#### C-5 · /reset clears shared group state
| Step | Action | Expected |
|------|--------|----------|
| 1 | After C-4, reset the group session | |
| 2 | User B says `@golem-test what is Alice's name?` | Bot says it doesn't know (context cleared) |

---

## Platform D — Feishu (飞书)

### Setup
- App ID and App Secret from Feishu Open Platform
- Enable message event permissions
- Bot added to test group

### Test Cases

#### D-1 · DM Basic Flow
| Step | Action | Expected |
|------|--------|----------|
| 1 | DM the bot: `你好` | Bot replies in the same language |
| 2 | Session key format: `feishu:USER_OPEN_ID:USER_OPEN_ID` (DM chatId = userId) | Check terminal |

#### D-2 · Group — XML-style @mention
Feishu uses `<at user_id="xxx">BotName</at>` for mentions.
| Step | Action | Expected |
|------|--------|----------|
| 1 | @mention the bot in group (tap on bot name) | Bot replies |
| 2 | Terminal: stripped mention text passed to engine | `<at...>` tags removed from prompt |
| 3 | Send message without mention | Bot silent (mention-only) |

#### D-3 · Group — smart mode with Chinese context
Change to `groupPolicy: smart`.
| Step | Action | Expected |
|------|--------|----------|
| 1 | Chat member: `我们明天开会讨论新功能` | Bot observes (may reply or [PASS]) |
| 2 | @mention bot: `刚才说的新功能是什么?` | Bot recalls from group context |

#### D-4 · Attachment/image messages
| Step | Action | Expected |
|------|--------|----------|
| 1 | Send an image (no text) to group | Bot ignores (empty text) |
| 2 | Terminal: no "received" log | ✓ (adapter should filter non-text messages) |

---

## Platform E — DingTalk (钉钉)

### Setup
- App Key and App Secret, Webhook endpoint configured
- Bot added to test group (Enterprise Internal App)

### Test Cases

#### E-1 · DM Basic Flow
Same pattern as D-1.

#### E-2 · Group — @mention detection
DingTalk uses `@UserMobile` or `@botName` style.
| Step | Action | Expected |
|------|--------|----------|
| 1 | @mention bot in group | Bot replies |
| 2 | Verify message length ≤ 4000 chars | DingTalk limit respected |

#### E-3 · Group session shared across users
Same as C-4 but in DingTalk group.

---

## Platform F — WeCom (企业微信)

### Setup
- Corp ID, Agent ID, Agent Secret
- Bot added to test group or app chat

### Test Cases

#### F-1 · DM Basic Flow
Same pattern, note session key format.

#### F-2 · Message length limit (2048 chars)
| Step | Action | Expected |
|------|--------|----------|
| 1 | Ask for a long response | Bot splits at ≤ 2048 chars (WeCom limit) |

#### F-3 · Group — mention-only
| Step | Action | Expected |
|------|--------|----------|
| 1 | Regular group message | Bot silent |
| 2 | @mention bot | Bot replies |

---

## Cross-Platform Verification Checklist

After completing platform-specific tests, verify these behaviors are consistent:

| Behavior | Telegram | Discord | Slack | Feishu | DingTalk | WeCom |
|----------|----------|---------|-------|--------|----------|-------|
| DM → per-user session key | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Group → shared session key | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| mention-only: non-mention skipped | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| mention-only: mention replied | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Long reply split correctly | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| /reset clears session | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Bot self-echo not triggered | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Empty @mention not sent to engine | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

---

## Known Issues & Gotchas

| Issue | Platforms | Workaround |
|-------|-----------|------------|
| `botName` must match `config.name` exactly for self-echo prevention | All | Set `name: your-bot-username` in golem.yaml |
| Discord: MessageContent intent must be privileged-enabled | Discord | Enable in Developer Portal |
| Slack: Socket Mode requires separate App Token | Slack | Create `xapp-...` token |
| Feishu: message events require subscription in open platform | Feishu | Enable `im.message.receive_v1` |
| WeCom: group messages need app configured as "group robot" | WeCom | Check enterprise admin settings |
| DingTalk: outgoing webhook signature must match | DingTalk | Set `secret` in golem.yaml channels.dingtalk |

---

## Reporting Issues

If a test case fails, capture:
1. The verbose terminal log for the received message and error
2. The raw payload from the IM platform (if visible)
3. The golem.yaml channels config (redact tokens)

File an issue at: https://github.com/0xranx/AgentForge/issues
