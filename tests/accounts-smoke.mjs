import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createDayloomServer } from '../server/app.mjs';
import { emptyData } from '../shared/sync-data.mjs';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'test-results');
await fs.mkdir(output, { recursive: true });
const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'dayloom-accounts-ui-'));
const profiles = [path.join(folder, 'device-a'), path.join(folder, 'device-b')];
for (const dir of profiles) { await fs.mkdir(dir); await fs.writeFile(path.join(dir, 'shixu-data.json'), JSON.stringify(emptyData())); }
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const packaged = process.argv.includes('--packaged');
const database = path.join(folder, 'server.sqlite');
let server = createDayloomServer({ database });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port, endpoint = `http://127.0.0.1:${port}`;
const closeServer = () => new Promise((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeIdleConnections(); });
const apps = [], pages = [], errors = [], checks = [];
const record = text => { checks.push(text); console.log(`PASS ${text}`); };
const button = (page, name) => page.getByRole('button', { name, exact: true });
async function launch(index) {
  const app = await electron.launch({ ...(packaged ? { executablePath: path.join(root, 'release/win-unpacked/拾序.exe') } : {}), args: [...(packaged ? [] : [root]), `--data-dir=${profiles[index]}`, '--test-mode', '--force-device-scale-factor=1'], env });
  apps[index] = app; const page = await app.firstWindow(); pages[index] = page;
  page.on('pageerror', error => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.getByRole('heading', { name: '今天', exact: true })).toBeVisible();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 960));
  return page;
}
async function login(page, register = false) {
  await button(page, '设置').click();
  if (register) await button(page, '注册账号').click();
  await page.getByLabel('同步服务地址', { exact: true }).fill(endpoint);
  await page.getByLabel('账号用户名', { exact: true }).fill('dayloom_ui');
  await page.getByLabel('账号密码', { exact: true }).fill('dayloom-ui-test-password');
  if (register) {
    await page.getByLabel('账号昵称', { exact: true }).fill('我的同步空间');
    await page.getByLabel('确认密码', { exact: true }).fill('dayloom-ui-test-password');
    await expect(button(page, '注册账号')).toHaveAttribute('aria-pressed', 'true');
    await page.screenshot({ path: path.join(output, 'account-register.png'), animations: 'disabled' });
  }
  await button(page, register ? '创建账号并同步' : '登录并同步').click();
  await expect(page.locator('.account-heading strong')).toHaveText('我的同步空间');
  await expect(page.locator('.sync-badge')).toHaveText('已同步');
  await button(page, '关闭弹窗').click();
}
async function sync(page) {
  if (!await page.getByRole('dialog', { name: '设置', exact: true }).count()) await button(page, '设置').click();
  await expect(button(page, '立即同步')).toBeEnabled({ timeout: 20000 });
  await button(page, '立即同步').click();
  await expect(page.locator('.sync-badge')).toHaveText('已同步', { timeout: 20000 });
  await button(page, '关闭弹窗').click();
}
try {
  let first = await launch(0), second = await launch(1);
  await login(first, true); await login(second);
  record('两个独立桌面进程注册、登录同一账号');
  await expect(button(first, '重要不紧急')).toHaveCount(0);
  await button(first, '新建任务').click();
  await first.getByLabel('任务名称', { exact: true }).fill('两台设备共享的远期任务');
  await first.getByLabel('计划日期', { exact: true }).fill('2027-12-01');
  await first.getByLabel('优先级', { exact: true }).selectOption('4');
  await button(first, '创建任务').click();
  await expect(button(first, '编辑任务 两台设备共享的远期任务')).toBeVisible();
  await expect(first.locator('.profile-button small')).toHaveText('已同步', { timeout: 20000 });
  await expect(button(second, '编辑任务 两台设备共享的远期任务')).toBeVisible({ timeout: 20000 });
  await first.screenshot({ path: path.join(output, 'account-important-today.png') });
  await button(first, '编辑任务 两台设备共享的远期任务').click();
  await button(second, '编辑任务 两台设备共享的远期任务').click();
  await second.getByLabel('任务备注', { exact: true }).fill('来自另一台设备的修改');
  await button(second, '保存更改').click(); await sync(second);
  const cacheDirectory = path.join(profiles[0], 'accounts');
  const cacheFile = path.join(cacheDirectory, (await fs.readdir(cacheDirectory)).find(file => file.endsWith('.json')));
  await expect.poll(async () => { try { return JSON.parse(await fs.readFile(cacheFile, 'utf8')).data.tasks[0]?.notes; } catch { return null; } }, { timeout: 20000 }).toBe('来自另一台设备的修改');
  await first.getByLabel('添加子任务', { exact: true }).fill('编辑期间保留另一设备的备注');
  await first.getByLabel('添加子任务', { exact: true }).press('Enter');
  await button(first, '保存更改').click(); await sync(first);
  await button(first, '编辑任务 两台设备共享的远期任务').click();
  await expect(first.getByLabel('任务备注', { exact: true })).toHaveValue('来自另一台设备的修改');
  await button(first, '关闭弹窗').click();
  record('远期非常重要任务每天显示，跨设备同步创建和编辑；打开的编辑器保留期间收到的其他字段修改');
  const secureSession = JSON.parse(await fs.readFile(path.join(profiles[0], 'account-session.json'), 'utf8'));
  assert.deepEqual(Object.keys(secureSession), ['encrypted']); assert.equal(JSON.stringify(secureSession).includes('dayloom-ui-test-password'), false);
  const publicAuth = await first.evaluate(() => window.desktop.account.session());
  assert.equal(publicAuth.token, undefined); assert.equal(publicAuth.user.username, 'dayloom_ui');
  await apps[0].close(); apps[0] = null; first = await launch(0);
  await expect(button(first, '编辑任务 两台设备共享的远期任务')).toBeVisible();
  await button(first, '设置').click(); await expect(first.locator('.account-heading strong')).toHaveText('我的同步空间');
  await first.screenshot({ path: path.join(output, 'account-synced.png'), animations: 'disabled' }); await button(first, '关闭弹窗').click();
  record('桌面重启恢复登录和账号缓存，令牌由系统加密且不暴露给页面');
  await closeServer();
  await button(first, '编辑任务 两台设备共享的远期任务').click(); await first.getByLabel('任务备注', { exact: true }).fill('断网时保存的修改'); await button(first, '保存更改').click();
  await button(first, '设置').click(); await button(first, '立即同步').click();
  await expect(first.locator('.sync-badge')).toHaveText('离线 · 待同步'); await first.screenshot({ path: path.join(output, 'account-offline.png') });
  server = createDayloomServer({ database }); await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
  await sync(first); await sync(second);
  await button(second, '编辑任务 两台设备共享的远期任务').click(); await expect(second.getByLabel('任务备注', { exact: true })).toHaveValue('断网时保存的修改'); await button(second, '关闭弹窗').click();
  record('服务停止后离线编辑，重启服务后继续双向同步');
  await second.getByRole('checkbox', { name: '完成 两台设备共享的远期任务', exact: true }).click(); await sync(second); await sync(first);
  await expect(first.getByRole('checkbox', { name: '恢复 两台设备共享的远期任务', exact: true })).toBeChecked();
  await button(first, '编辑任务 两台设备共享的远期任务').click(); await button(first, '删除任务').click(); await sync(first); await sync(second);
  await expect(button(second, '编辑任务 两台设备共享的远期任务')).toHaveCount(0);
  record('完成状态与删除在另一台设备同步，不生成每日副本');
  await button(second, '设置').click(); await button(second, '退出').click(); await button(second, '退出账号').click();
  await expect(button(second, '登录并同步')).toBeVisible(); await button(second, '关闭弹窗').click();
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(profiles[1], 'shixu-data.json'), 'utf8')), emptyData());
  assert.deepEqual(errors, []); record('退出恢复独立访客空间，原本机数据未被账号覆盖，无页面异常');
  await fs.writeFile(path.join(output, packaged ? 'accounts-packaged-report.json' : 'accounts-smoke-report.json'), JSON.stringify({ checks, errors, folder }, null, 2));
} catch (error) {
  for (let i = 0; i < pages.length; i++) try { await pages[i].screenshot({ path: path.join(output, `account-failure-${i}.png`) }); } catch {}
  throw error;
} finally {
  for (const app of apps) if (app) await app.close().catch(() => {});
  if (server.listening) await closeServer();
}
