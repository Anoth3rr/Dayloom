import { app, BrowserWindow, ipcMain, dialog, nativeTheme, Notification, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { assertData } from '../shared/schema.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dev = process.argv.includes('--dev');
const testArg = process.argv.find(arg => arg.startsWith('--data-dir='));
if (testArg) app.setPath('userData', path.resolve(testArg.slice('--data-dir='.length)));
app.setName('拾序');
app.setAppUserModelId('app.shixu.desktop');
let win;
let currentData = null;
let storageBlocked = false;
let reminderTimer;
const startedAt = Date.now();
const acrylicSupported = process.platform === 'win32' && Number(os.release().split('.')[2]) >= 22621;
const notified = new Set();
const dataPath = () => path.join(app.getPath('userData'), 'shixu-data.json');

function readJson(file) {
  if (fs.statSync(file).size > 20 * 1024 * 1024) throw new Error('数据文件过大');
  return assertData(JSON.parse(fs.readFileSync(file, 'utf8')));
}
function load() {
  const file = dataPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file)) return { data: null, path: file };
  try { currentData = readJson(file); return { data: currentData, path: file }; }
  catch {
    fs.copyFileSync(file, `${file}.corrupted-${Date.now()}`);
    try {
      currentData = readJson(`${file}.backup`);
      fs.writeFileSync(`${file}.tmp`, JSON.stringify(currentData, null, 2));
      fs.renameSync(`${file}.tmp`, file);
      return { data: currentData, path: file, warning: '已从上一份备份恢复，损坏的原始数据已保留。' };
    } catch {
      storageBlocked = true;
      throw new Error('数据文件及备份均无法读取，原始文件已保留。请打开数据目录进行恢复。');
    }
  }
}
function save(data) {
  if (storageBlocked) throw new Error('数据读取异常，已停止写入以保护原始文件。');
  assertData(data);
  const file = dataPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  const fd = fs.openSync(temp, 'w');
  try { fs.writeFileSync(fd, JSON.stringify(data, null, 2), 'utf8'); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
  if (fs.existsSync(file)) {
    try { readJson(file); fs.copyFileSync(file, `${file}.backup`); }
    catch { fs.copyFileSync(file, `${file}.corrupted-${Date.now()}`); }
  }
  fs.renameSync(temp, file);
  currentData = data;
}
function checkSender(event) {
  if (!win || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) throw new Error('Invalid sender');
}
function registerIPC() {
  const handle = (name, fn) => ipcMain.handle(name, (event, ...args) => { checkSender(event); return fn(...args); });
  handle('data:load', load);
  handle('data:save', save);
  ipcMain.on('data:flush', (event, data) => {
    try { checkSender(event); save(data); event.returnValue = true; }
    catch (error) { event.returnValue = error.message; }
  });
  ipcMain.on('window:action', (event, action) => {
    checkSender(event);
    if (action === 'minimize') win.minimize();
    if (action === 'maximize') win.isMaximized() ? win.unmaximize() : win.maximize();
    if (action === 'close') win.close();
  });
  ipcMain.on('appearance:theme', (event, theme) => {
    checkSender(event);
    if (['light', 'dark', 'system'].includes(theme)) {
      nativeTheme.themeSource = theme;
      if (!acrylicSupported) win.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#17202e' : '#f2f5fa');
    }
  });
  handle('data:export', async (data) => {
    assertData(data);
    const result = await dialog.showSaveDialog(win, { title: '导出拾序备份', defaultPath: `拾序备份-${new Date().toLocaleDateString('sv-SE')}.json`, filters: [{ name: 'JSON 备份', extensions: ['json'] }] });
    if (result.canceled || !result.filePath) return false;
    fs.writeFileSync(result.filePath, JSON.stringify(data, null, 2), 'utf8'); return true;
  });
  handle('data:import', async () => {
    const result = await dialog.showOpenDialog(win, { title: '选择拾序备份', properties: ['openFile'], filters: [{ name: 'JSON 备份', extensions: ['json'] }] });
    if (result.canceled || !result.filePaths[0]) return null;
    return readJson(result.filePaths[0]);
  });
  handle('data:folder', async () => { await shell.openPath(app.getPath('userData')); });
}
function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 940, minWidth: 1080, minHeight: 720, frame: false,
    title: 'Dayloom · 拾序', show: false,
    backgroundColor: acrylicSupported ? '#00FFFFFF' : '#f2f5fa',
    ...(acrylicSupported ? { backgroundMaterial: 'acrylic' } : {}),
    icon: path.join(root, 'build/icon.png'),
    webPreferences: { preload: path.join(root, 'electron/preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, backgroundThrottling: false },
  });
  win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  win.once('ready-to-show', () => { if (!process.argv.includes('--test-mode')) win.show(); });
  if (dev) win.loadURL('http://127.0.0.1:5173');
  else win.loadFile(path.join(root, 'dist/index.html'));
  win.on('closed', () => { win = null; });
}
function checkReminders() {
  if (!currentData || !Notification.isSupported()) return;
  const now = Date.now();
  for (const task of currentData.tasks) {
    if (!task.reminder || task.completed || !task.date || !task.time) continue;
    const due = new Date(`${task.date}T${task.time}:00`).getTime();
    const key = `${task.id}:${task.date}:${task.time}`;
    if (due < startedAt - 1000 || due > now || now - due > 300000 || notified.has(key)) continue;
    notified.add(key);
    const notification = new Notification({ title: task.title, body: `任务提醒 · ${task.time}`, icon: path.join(root, 'build/icon.png') });
    notification.on('click', () => { if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } });
    notification.show();
  }
}
const locked = app.requestSingleInstanceLock();
if (!locked) app.quit();
else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } });
  app.whenReady().then(() => {
    registerIPC(); createWindow(); reminderTimer = setInterval(checkReminders, 15000);
    app.on('activate', () => { if (!win) createWindow(); });
  });
  app.on('window-all-closed', () => { clearInterval(reminderTimer); app.quit(); });
}
