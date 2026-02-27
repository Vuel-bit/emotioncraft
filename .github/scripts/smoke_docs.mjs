import { chromium } from 'playwright';

const baseUrl = process.env.SMOKE_URL || 'http://127.0.0.1:4173/index.html';
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS || 30000);

const consoleErrors = [];
const pageErrors = [];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();

page.on('console', (msg) => {
  if (msg.type() === 'error') {
    consoleErrors.push(msg.text());
  }
});

page.on('pageerror', (err) => {
  pageErrors.push(err?.stack || err?.message || String(err));
});

try {
  await page.goto(baseUrl, { waitUntil: 'load', timeout: timeoutMs });
  await page.waitForTimeout(1500);
} finally {
  await browser.close();
}

if (consoleErrors.length || pageErrors.length) {
  console.error('Smoke test failed. Browser errors detected.');
  if (consoleErrors.length) {
    console.error(`Console errors (${consoleErrors.length}):`);
    for (const err of consoleErrors) console.error(`- ${err}`);
  }
  if (pageErrors.length) {
    console.error(`Page errors (${pageErrors.length}):`);
    for (const err of pageErrors) console.error(`- ${err}`);
  }
  process.exit(1);
}

console.log('Smoke test passed: no console.error or pageerror events detected.');
