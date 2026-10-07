import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { accountHttp, authenticatedSession, publicSession } from '../shared/account-http.mjs';
import { assertEnvelope } from '../shared/sync-data.mjs';

export function createAccountStorage({ app, safeStorage, onData }) {
  const root = app.getPath('userData');
  const sessionFile = path.join(root, 'account-session.json');
  const blocked = new Set();
  let session = null, initialized = false;
  function atomic(file, value) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temp = `${file}.tmp`, fd = fs.openSync(temp, 'w', 0o600);
    try { fs.writeFileSync(fd, JSON.stringify(value), 'utf8'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(temp, file);
  }
  function sessionValue() {
    if (initialized) return session;
    initialized = true;
    if (!fs.existsSync(sessionFile)) return null;
    try {
      if (fs.statSync(sessionFile).size > 32768 || !safeStorage.isEncryptionAvailable()) return null;
      const encrypted = JSON.parse(fs.readFileSync(sessionFile, 'utf8')).encrypted;
      const value = JSON.parse(safeStorage.decryptString(Buffer.from(encrypted, 'base64')));
      session = { ...authenticatedSession(value.endpoint, value), remembered: true };
    } catch { session = null; }
    return session;
  }
  function remember(value) {
    const secure = safeStorage.isEncryptionAvailable() && (process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text');
    const next = { ...value, remembered: secure };
    if (secure) atomic(sessionFile, { encrypted: safeStorage.encryptString(JSON.stringify(next)).toString('base64') });
    else if (fs.existsSync(sessionFile)) fs.unlinkSync(sessionFile);
    initialized = true; session = next;
  }
  function profilePath(key) {
    if (typeof key !== 'string' || !key.includes('\0') || key.length > 2300) throw new Error('账号缓存编号无效');
    const active = sessionValue();
    if (!active || key !== `${active.endpoint}\0${active.user.id}`) throw new Error('账号已切换，无法访问其他账号的缓存');
    return path.join(root, 'accounts', `${createHash('sha256').update(key).digest('hex')}.json`);
  }
  function read(file) {
    if (fs.statSync(file).size > 70 * 1024 * 1024) throw new Error('账号缓存文件过大');
    return assertEnvelope(JSON.parse(fs.readFileSync(file, 'utf8')));
  }
  return {
    session: () => publicSession(sessionValue()),
    async call(request) {
      if (!request || typeof request.operation !== 'string') throw new Error('账号请求无效');
      if (request.operation === 'logout') {
        const previous = sessionValue();
        if (fs.existsSync(sessionFile)) fs.unlinkSync(sessionFile);
        session = null; initialized = true; onData(null);
        try { await accountHttp(request, previous); } catch { /* Local logout also works offline. */ }
        return { status: 200, body: { ok: true } };
      }
      const result = await accountHttp(request, sessionValue());
      if (['login', 'register'].includes(request.operation) && result.status < 300) {
        remember(authenticatedSession(request.endpoint, result.body)); onData(null);
        return { status: result.status, body: { session: publicSession(session) } };
      }
      return result;
    },
    loadProfile(key) {
      const file = profilePath(key); onData(null);
      if (!fs.existsSync(file)) return { envelope: null, path: file };
      try { const envelope = read(file); onData(envelope.data); return { envelope, path: file }; }
      catch {
        fs.copyFileSync(file, `${file}.corrupted-${Date.now()}`);
        try { const envelope = read(`${file}.backup`); atomic(file, envelope); onData(envelope.data); return { envelope, path: file, warning: '已从账号缓存备份恢复，损坏原件已保留。' }; }
        catch { blocked.add(key); throw new Error('账号缓存及备份无法读取，原文件已保留；请先恢复备份。'); }
      }
    },
    saveProfile(key, envelope) {
      const file = profilePath(key); assertEnvelope(envelope);
      if (blocked.has(key)) throw new Error('已暂停写入以保护损坏的账号缓存');
      if (fs.existsSync(file)) {
        try { read(file); fs.copyFileSync(file, `${file}.backup`); }
        catch { fs.copyFileSync(file, `${file}.corrupted-${Date.now()}`); }
      }
      atomic(file, envelope); onData(envelope.data);
    },
  };
}
