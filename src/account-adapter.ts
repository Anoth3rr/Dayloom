import { accountHttp, authenticatedSession, publicSession } from '../shared/account-http.mjs';
import type { PrivateSession } from '../shared/account-http.mjs';
import { assertEnvelope } from '../shared/sync-data.mjs';
import { loadData, saveData } from './storage';
import type { WorkspaceAdapter, WorkspaceEnvelope } from './account-types';

const sessionKey = 'dayloom.account.session';
export function browserAdapter(): WorkspaceAdapter {
  let cached: PrivateSession | null | undefined;
  function session() {
    if (cached !== undefined) return cached;
    try { const value = JSON.parse(sessionStorage.getItem(sessionKey) || 'null'); cached = value ? authenticatedSession(value.endpoint, value) : null; }
    catch { cached = null; }
    return cached;
  }
  const keyOf = (key: string) => `dayloom.account.${key}`;
  function write(key: string, envelope: WorkspaceEnvelope) {
    assertEnvelope(envelope);
    const file = keyOf(key), previous = localStorage.getItem(file);
    if (previous) { try { assertEnvelope(JSON.parse(previous)); localStorage.setItem(`${file}.backup`, previous); } catch { /* Keep the last valid backup. */ } }
    localStorage.setItem(file, JSON.stringify(envelope));
  }
  return {
    loadGuest: loadData, saveGuest: saveData,
    flushGuest: data => { try { localStorage.setItem('shixu.data.v1', JSON.stringify(data)); return true; } catch (error) { return String(error); } },
    session: async () => publicSession(session()),
    async call(request) {
      if (request.operation === 'logout') {
        const previous = session(); sessionStorage.removeItem(sessionKey); cached = null;
        try { await accountHttp(request, previous); } catch { /* Logout works offline. */ }
        return { status: 200, body: { ok: true } };
      }
      const result = await accountHttp(request, session());
      if (['register', 'login'].includes(request.operation) && result.status < 300) {
        const next = authenticatedSession(request.endpoint!, result.body);
        sessionStorage.setItem(sessionKey, JSON.stringify(next)); cached = next;
        return { status: result.status, body: { session: publicSession(cached) } };
      }
      return result;
    },
    async loadProfile(key) {
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
