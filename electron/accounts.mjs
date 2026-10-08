import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createAccountService, profileKey } from '../shared/account-service.mjs';
import { assertEnvelope } from '../shared/sync-data.mjs';

export function createAccountStorage({ app, safeStorage, onData }) {
  const root = app.getPath('userData');
  const sessionFile = path.join(root, 'account-session.json');
  const vaultFile = path.join(root, 'webdav-accounts.json');
  const blocked = new Set();
  function atomic(file, value) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temp = `${file}.tmp`, fd = fs.openSync(temp, 'w', 0o600);
    try { fs.writeFileSync(fd, JSON.stringify(value), 'utf8'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(temp, file);
  }
  const service = createAccountService({
    load() {
      const file = fs.existsSync(vaultFile) ? vaultFile : sessionFile;
      if (!fs.existsSync(file)) return null;
      try {
        if (fs.statSync(file).size > 2 * 1024 * 1024 || !safeStorage.isEncryptionAvailable()) throw new Error('无法解密');
        const encrypted = JSON.parse(fs.readFileSync(file, 'utf8')).encrypted;
        const value = JSON.parse(safeStorage.decryptString(Buffer.from(encrypted, 'base64')));
        return { value: file === vaultFile ? value : { version: 1, active: profileKey(value), accounts: [value] }, remembered: true };
      } catch { throw new Error('无法读取已保存的账号凭据，原文件已保留。请在原 Windows 账号下打开，或备份后移走 webdav-accounts.json / account-session.json 再重新连接。'); }
    },
    save(value) {
      const secure = safeStorage.isEncryptionAvailable() && (process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text');
      if (secure) {
        atomic(vaultFile, { encrypted: safeStorage.encryptString(JSON.stringify(value)).toString('base64') });
        // A migrated legacy token must not reactivate after an explicit removal.
        try { if (fs.existsSync(sessionFile)) fs.renameSync(sessionFile, `${sessionFile}.migrated-${Date.now()}`); }
        catch { /* The committed vault takes precedence; leave the encrypted legacy copy intact. */ }
      }
      return secure;
    },
  });
  function profilePath(key) {
    if (typeof key !== 'string' || key.length > 4096) throw new Error('账号缓存编号无效');
    const active = service.active();
    if (!active || key !== profileKey(active)) throw new Error('账号已切换，无法访问其他账号的缓存');
    return path.join(root, 'accounts', `${createHash('sha256').update(key).digest('hex')}.json`);
  }
  function read(file) {
    if (fs.statSync(file).size > 70 * 1024 * 1024) throw new Error('账号缓存文件过大');
    return assertEnvelope(JSON.parse(fs.readFileSync(file, 'utf8')));
  }
  return {
    session: service.session,
    async call(request) {
      const result = await service.call(request);
      if (['login', 'register', 'webdav-connect', 'switch', 'logout'].includes(request.operation) && result.status < 300) onData(null);
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
