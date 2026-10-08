import { createAccountService, profileKey } from '../shared/account-service.mjs';
import { assertEnvelope } from '../shared/sync-data.mjs';
import { loadData, saveData } from './storage';
import type { WorkspaceAdapter, WorkspaceEnvelope } from './account-types';

const sessionKey = 'dayloom.account.session';
const vaultKey = 'dayloom.webdav.accounts';
export function browserAdapter(): WorkspaceAdapter {
  const service = createAccountService({
    load() {
      const current = sessionStorage.getItem(vaultKey);
      if (current) return { value: JSON.parse(current), remembered: false };
      const legacy = JSON.parse(sessionStorage.getItem(sessionKey) || 'null');
      return legacy ? { value: { version: 1, active: profileKey(legacy), accounts: [legacy] }, remembered: false } : null;
    },
    save(value) { sessionStorage.setItem(vaultKey, JSON.stringify(value)); sessionStorage.removeItem(sessionKey); return false; },
  });
  function checkKey(key: string) {
    const active = service.active();
    if (!active || profileKey(active) !== key) throw new Error('账号已切换，无法访问其他账号的缓存');
  }
  const keyOf = (key: string) => `dayloom.account.${key}`;
  function write(key: string, envelope: WorkspaceEnvelope) {
    checkKey(key);
    assertEnvelope(envelope);
    const file = keyOf(key), previous = localStorage.getItem(file);
    if (previous) { try { assertEnvelope(JSON.parse(previous)); localStorage.setItem(`${file}.backup`, previous); } catch { /* Keep the last valid backup. */ } }
    localStorage.setItem(file, JSON.stringify(envelope));
  }
  return {
    loadGuest: loadData, saveGuest: saveData,
    flushGuest: data => { try { localStorage.setItem('shixu.data.v1', JSON.stringify(data)); return true; } catch (error) { return String(error); } },
    session: async () => service.session(),
    call: service.call,
    async loadProfile(key) {
      checkKey(key);
      const file = keyOf(key), raw = localStorage.getItem(file), path = '当前浏览器的账号缓存';
      if (!raw) return { envelope: null, path };
      try { return { envelope: assertEnvelope(JSON.parse(raw)), path }; }
      catch {
        localStorage.setItem(`${file}.corrupted.${Date.now()}`, raw);
        const backup = localStorage.getItem(`${file}.backup`);
        if (backup) { try { return { envelope: assertEnvelope(JSON.parse(backup)), path, warning: '已从账号缓存备份恢复。' }; } catch { /* Preserve both copies. */ } }
        throw new Error('账号缓存损坏，原始内容已保留，请先恢复备份。');
      }
    },
    saveProfile: async (key, envelope) => write(key, envelope),
    flushProfile: (key, envelope) => { try { write(key, envelope); return true; } catch (error) { return String(error); } },
  };
}
export function createWorkspaceAdapter(): WorkspaceAdapter {
  if (!window.desktop) return browserAdapter();
  return { ...window.desktop.account, loadGuest: loadData, saveGuest: saveData, flushGuest: data => window.desktop!.flush(data) };
}
