import { seedData, validateData } from './domain';
import type { AppData } from './types';
const KEY = 'shixu.data.v1';

export async function loadData(): Promise<{ data: AppData; warning?: string; path: string }> {
  if (window.desktop) {
    const loaded = await window.desktop.load();
    return { ...loaded, data: loaded.data ? validateData(loaded.data) : seedData() };
  }
  const raw = localStorage.getItem(KEY);
  if (!raw) return { data: seedData(), path: '当前浏览器的本地存储' };
  try { return { data: validateData(JSON.parse(raw)), path: '当前浏览器的本地存储' }; }
  catch {
    localStorage.setItem(`${KEY}.corrupted.${Date.now()}`, raw);
    const backup = localStorage.getItem(`${KEY}.backup`);
    if (backup) {
      try { return { data: validateData(JSON.parse(backup)), warning: '已从本地备份恢复，损坏的原始数据已保留。', path: '当前浏览器的本地存储' }; } catch { /* Keep both original copies. */ }
    }
    throw new Error('本地数据无法读取，原始内容已保留。请先导出浏览器存储或联系维护者恢复。');
  }
}
export async function saveData(data: AppData): Promise<void> {
  validateData(data);
  if (window.desktop) return window.desktop.save(data);
  const previous = localStorage.getItem(KEY);
  if (previous) { try { validateData(JSON.parse(previous)); localStorage.setItem(`${KEY}.backup`, previous); } catch { /* Never replace a valid backup with invalid data. */ } }
  localStorage.setItem(KEY, JSON.stringify(data));
}
export async function exportData(data: AppData): Promise<boolean> {
  if (window.desktop) return window.desktop.exportData(data);
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = `拾序备份-${new Date().toISOString().slice(0, 10)}.json`; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000); return true;
}
export async function importData(): Promise<AppData | null> {
  if (window.desktop) return window.desktop.importData();
  return new Promise((resolve, reject) => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = '.json,application/json';
    input.addEventListener('cancel', () => resolve(null), { once: true });
    input.addEventListener('change', async () => {
      const file = input.files?.[0]; if (!file) return resolve(null);
      if (file.size > 20 * 1024 * 1024) return reject(new Error('备份文件不能超过 20 MB'));
      try { resolve(validateData(JSON.parse(await file.text()))); } catch (error) { reject(error); }
    }, { once: true }); input.click();
  });
}
