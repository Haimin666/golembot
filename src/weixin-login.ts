#!/usr/bin/env node
/**
 * WeChat iLink Bot QR Login — obtain a bearer token for the WeChat adapter.
 *
 * Usage:
 *   npx tsx src/weixin-login.ts
 *
 * Steps:
 *   1. Fetches a QR code from iLink Bot API
 *   2. Displays it in the terminal (scan with WeChat)
 *   3. Polls until login is confirmed
 *   4. Prints the bearer token
 */

const BASE_URL = process.argv[2] || 'https://ilinkai.weixin.qq.com';

async function main() {
  // Step 1: Get QR code
  console.log('Fetching QR code from iLink Bot...\n');

  const qrResp = await fetch(`${BASE_URL}/ilink/bot/get_bot_qrcode?bot_type=3`);
  if (!qrResp.ok) {
    console.error(`Failed to get QR code: HTTP ${qrResp.status}`);
    process.exit(1);
  }

  const qrData = (await qrResp.json()) as {
    qrcode?: string;
    qrcode_img_content?: string;
  };

  const qrcodeToken = qrData.qrcode;
  const qrcodeUrl = qrData.qrcode_img_content;

  if (!qrcodeToken) {
    console.error('No qrcode token in response:', JSON.stringify(qrData));
    process.exit(1);
  }

  // Step 2: Display QR code in terminal
  if (qrcodeUrl) {
    try {
      // qrcode-terminal is CJS — use createRequire for reliable import
      const { createRequire } = await import('node:module');
      const require = createRequire(import.meta.url);
      const qrTerminal = require('qrcode-terminal');
      qrTerminal.generate(qrcodeUrl, { small: true });
    } catch {
      console.log('(Install qrcode-terminal for inline QR display: pnpm add qrcode-terminal)');
    }
    console.log(`\nOr open this URL in browser to scan:\n  ${qrcodeUrl}\n`);
  }

  console.log('Waiting for WeChat scan...\n');

  // Step 3: Poll for confirmation
  const POLL_INTERVAL = 3000;
  const TIMEOUT = 5 * 60 * 1000;
  const startTime = Date.now();

  while (Date.now() - startTime < TIMEOUT) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 35_000);

    try {
      const statusResp = await fetch(`${BASE_URL}/ilink/bot/get_qrcode_status?qrcode=${qrcodeToken}`, {
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!statusResp.ok) {
        console.error(`Status check failed: HTTP ${statusResp.status}`);
        await sleep(POLL_INTERVAL);
        continue;
      }

      const statusData = (await statusResp.json()) as {
        status?: string;
        bot_token?: string;
        baseurl?: string;
        ilink_bot_id?: string;
        ilink_user_id?: string;
      };

      switch (statusData.status) {
        case 'wait':
          process.stdout.write('.');
          break;
        case 'scaned':
          console.log('\nQR code scanned! Confirm on your phone...');
          break;
        case 'expired':
          console.error('\nQR code expired. Please run again.');
          process.exit(1);
          break;
        case 'confirmed': {
          console.log('\n\nLogin successful!\n');
          console.log('─'.repeat(60));
          console.log(`Token:    ${statusData.bot_token}`);
          if (statusData.baseurl) console.log(`Base URL: ${statusData.baseurl}`);
          if (statusData.ilink_bot_id) console.log(`Bot ID:   ${statusData.ilink_bot_id}`);
          if (statusData.ilink_user_id) console.log(`User ID:  ${statusData.ilink_user_id}`);
          console.log('─'.repeat(60));
          console.log('\nAdd to golem.yaml:\n');
          console.log('  channels:');
          console.log('    weixin:');
          console.log(`      token: "${statusData.bot_token}"`);
          if (statusData.baseurl && statusData.baseurl !== BASE_URL) {
            console.log(`      baseUrl: "${statusData.baseurl}"`);
          }
          console.log('\nOr set environment variable:\n');
          console.log(`  export WEIXIN_BOT_TOKEN="${statusData.bot_token}"`);
          console.log('');
          process.exit(0);
          break;
        }
        default:
          console.log(`Unknown status: ${statusData.status}`);
      }
    } catch (e) {
      clearTimeout(timer);
      if ((e as Error).name === 'AbortError') {
        // Timeout on long-poll, just retry
      } else {
        console.error(`Poll error: ${(e as Error).message}`);
      }
    }

    await sleep(POLL_INTERVAL);
  }

  console.error('\nLogin timed out (5 minutes). Please try again.');
  process.exit(1);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
