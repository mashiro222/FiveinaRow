// Manual deployment acceptance. Does not run in CI or keep the free host awake.
import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { DEFAULT_ROOM_SERVER } from '../src/online-client.js';

const apps = [], dirs = [], errors = [];
const executablePath = process.env.GAME_EXECUTABLE || undefined;
await fs.mkdir('test-results', { recursive: true });
async function launch(legacy = false) {
  const userData = await fs.mkdtemp(path.join(os.tmpdir(), 'yijian-public-')); dirs.push(userData);
  const app = await electron.launch({ executablePath, args: executablePath ? [] : ['.'], env: { ...process.env, YIJIAN_TEST_DATA: userData }, timeout: 30_000 }); apps.push(app);
  const page = await app.firstWindow(); page.on('pageerror', e => errors.push(e.message));
  if (legacy) {
    await page.evaluate(() => localStorage.setItem('yijian-room-server', 'ws://127.0.0.1:1/room'));
    await page.reload();
  }
  await page.locator('[data-page="online"]').click();
  if (legacy) {
    await page.locator('[data-online="default-service"]').click();
    await page.waitForFunction(() => document.querySelector('#online-connection-status')?.textContent === '已连接', null, { timeout: 125_000 });
  }
  assert.equal(await page.locator('#online-server').inputValue(), DEFAULT_ROOM_SERVER);
  return page;
}
async function join(page, code) {
  await page.locator('[name="code"]').fill(code); await page.locator('#online-join-form button').click();
  await page.waitForSelector('.online-seats', { timeout: 125_000 });
}
async function sit(page, seat, name) {
  await page.locator(`[data-online="seat"][data-seat="${seat}"]`).click();
  await page.locator('#online-seat-form [name="name"]').fill(name);
  await page.locator('#online-seat-form button[type="submit"]').click();
  await page.waitForSelector('[data-online="ready"]');
}
const stones = (page, n) => page.waitForFunction(n => document.querySelectorAll('[data-online-cell].occupied').length === n, n);
try {
  const a = await launch(), b = await launch(), watcher = await launch(true);
  await a.locator('[data-online="create"]').click(); await a.waitForSelector('.online-seats', { timeout: 125_000 });
  const code = (await a.locator('h1').textContent()).match(/\d{4}/)[0];
  await join(b, code); await join(watcher, code);
  await sit(a, 0, '松间'); await sit(b, 1, '竹影');
  await watcher.waitForFunction(() => document.querySelectorAll('[data-online="seat"]').length === 0);
  await a.locator('[name="forbidden"]').check();
  await a.selectOption('[name="turnSeconds"]', '120'); await a.locator('#online-rules-form button').click();
  await b.waitForFunction(() => document.querySelector('[name="turnSeconds"]').value === '120');
  await a.locator('[data-online="ready"]').click(); await b.locator('[data-online="ready"]').click();
  await a.waitForSelector('[data-online="resign"]');
  for (const index of [112, 113, 97, 127]) {
    const ply = await a.locator('[data-online-cell].occupied').count();
    await (ply % 2 ? b : a).locator(`[data-online-cell="${index}"]`).click();
    for (const page of [a, b, watcher]) await stones(page, ply + 1);
  }
  await watcher.bringToFront(); await watcher.waitForSelector('.winrate-labels', { timeout: 30_000 });
  const rates = await watcher.locator('.winrate-labels b').allTextContents();
  assert.ok(Math.abs(rates.reduce((sum, rate) => sum + parseFloat(rate), 0) - 100) < .01);
  await watcher.screenshot({ path: 'test-results/12-public-room.png', fullPage: true });
  await watcher.locator('#online-show-rate').uncheck(); assert.equal(await watcher.locator('.winrate-labels').count(), 0);
  await b.reload(); await b.locator('[data-page="online"]').click(); await b.waitForSelector('[data-online="resign"]'); await stones(b, 4);
  await a.locator('[data-online="resign"]').click(); await a.locator('[data-online="confirm-resign"]').click();
  for (const page of [a, b, watcher]) {
    await page.waitForFunction(() => document.querySelector('.board-status')?.textContent.includes('白方获胜'));
    await page.locator('[data-online="leave"]').click(); await page.waitForSelector('#online-connect-form');
  }
  assert.deepEqual(errors, []);
  console.log('PASS: three desktop clients use the built-in public service; legacy address switch, room number, named seats, rules, synchronized moves, native Rapfi rates, hide, reconnect, result and leave.');
} finally {
  for (const app of apps.reverse()) await app.close();
  for (const dir of dirs) await fs.rm(dir, { recursive: true, force: true });
  if (errors.length) console.error(errors);
}
