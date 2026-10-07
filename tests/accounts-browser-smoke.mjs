import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createDayloomServer } from '../server/app.mjs';

// A non-loopback HTTP origin exercises LAN browser support without a secure context.
const root = path.resolve(import.meta.dirname, '..');
const server = createDayloomServer({ staticDirectory: path.join(root, 'dist') });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const endpoint = `http://dayloom.test:${server.address().port}`;
let browser;
const errors = [], checks = [];
try {
  browser = await chromium.launch({ ...(process.platform === 'win32' ? { channel: 'msedge' } : {}), headless: true, args: ['--host-resolver-rules=MAP dayloom.test 127.0.0.1', '--no-proxy-server'] });
  const pages = [];
  for (let i = 0; i < 2; i++) {
    const context = await browser.newContext(); const page = await context.newPage(); pages.push(page);
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(endpoint);
    await expect(page.getByRole('heading', { name: '今天', exact: true })).toBeVisible();
    assert.equal(await page.evaluate(() => window.isSecureContext), false);
    await page.getByRole('button', { name: '设置', exact: true }).click();
    if (i === 0) await page.getByRole('button', { name: '注册账号', exact: true }).click();
    await page.getByLabel('账号用户名', { exact: true }).fill('browser_test');
    await page.getByLabel('账号密码', { exact: true }).fill('browser-test-password');
    if (i === 0) await page.getByLabel('确认密码', { exact: true }).fill('browser-test-password');
    await page.getByRole('button', { name: i === 0 ? '创建账号并同步' : '登录并同步', exact: true }).click();
    await expect(page.locator('.sync-badge')).toHaveText('已同步');
    await page.getByRole('button', { name: '关闭弹窗', exact: true }).click();
  }
  const [first, second] = pages;
  await first.getByRole('button', { name: '新建任务', exact: true }).click();
  await first.getByLabel('任务名称', { exact: true }).fill('局域网浏览器共享任务');
  await first.getByLabel('优先级', { exact: true }).selectOption('4');
  await first.getByLabel('计划日期', { exact: true }).fill('2027-12-01');
  await first.getByRole('button', { name: '创建任务', exact: true }).click();
  await expect(first.locator('.profile-button small')).toHaveText('已同步', { timeout: 20000 });
  await second.reload();
  await expect(second.getByRole('button', { name: '编辑任务 局域网浏览器共享任务', exact: true })).toBeVisible({ timeout: 20000 });
  checks.push('非安全 HTTP 局域网来源可注册、创建 UUID、自动同步；第二个浏览器空间重载后共享同一任务');
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(`${base}/api/sync`)).status, 401);
  assert.equal((await fetch(`${base}/api/health`, { headers: { Origin: 'http://untrusted.example' } })).status, 403);
  assert.equal((await fetch(`${base}/api/health`, { headers: { Origin: 'null' } })).status, 403);
  assert.equal((await fetch(`${base}/api/health`)).status, 200);
  checks.push('静态页面可用，无凭据请求及未允许的网页来源被拒绝');
  assert.deepEqual(errors, []);
  await fs.mkdir(path.join(root, 'test-results'), { recursive: true });
  await fs.writeFile(path.join(root, 'test-results/accounts-browser-report.json'), JSON.stringify({ checks, errors }, null, 2));
  for (const check of checks) console.log(`PASS ${check}`);
} finally {
  await browser?.close();
  await new Promise(resolve => { server.close(resolve); server.closeIdleConnections(); });
}
