import fs from 'node:fs';
import path from 'node:path';

function atomicWrite(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.migrating`, fd = fs.openSync(temporary, 'w', 0o600);
  try { fs.writeFileSync(fd, content); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(temporary, file);
}
function copyMissing(source, destination) {
  if (fs.existsSync(destination) || !fs.existsSync(source)) return;
  if (!fs.lstatSync(source).isFile()) throw new Error('旧数据路径不是普通文件');
  atomicWrite(destination, fs.readFileSync(source));
}

// Run before Electron initializes its sessions and safeStorage. On Windows,
// encrypted account credentials depend on the os_crypt key in Local State.
export function migrateDataDirectory(source, destination) {
  const oldRoot = path.resolve(source), newRoot = path.resolve(destination);
  if (oldRoot === newRoot) return;
  const marker = path.join(newRoot, 'migration-v1.json');
  if (fs.existsSync(marker) || !fs.existsSync(oldRoot)) return;
  fs.mkdirSync(newRoot, { recursive: true });

  const oldData = path.join(oldRoot, 'shixu-data.json'), newData = path.join(newRoot, 'data.json');
  if (!fs.existsSync(newData)) {
    copyMissing(`${oldData}.backup`, `${newData}.backup`);
    copyMissing(fs.existsSync(oldData) ? oldData : `${oldData}.backup`, newData);
    for (const name of fs.readdirSync(oldRoot)) {
      if (name.startsWith('shixu-data.json.corrupted-')) copyMissing(path.join(oldRoot, name), path.join(newRoot, name.replace('shixu-data.json', 'data.json')));
    }
  }

  const credentials = ['webdav-accounts.json', 'account-session.json'];
  if (!credentials.some(name => fs.existsSync(path.join(newRoot, name)))) {
    if (credentials.some(name => fs.existsSync(path.join(oldRoot, name)))) {
      const oldState = path.join(oldRoot, 'Local State'), newState = path.join(newRoot, 'Local State');
      if (fs.existsSync(oldState)) {
        const previous = JSON.parse(fs.readFileSync(oldState, 'utf8'));
        if (previous.os_crypt) {
          const current = fs.existsSync(newState) ? JSON.parse(fs.readFileSync(newState, 'utf8')) : {};
          copyMissing(newState, `${newState}.before-migration`);
          atomicWrite(newState, JSON.stringify({ ...current, os_crypt: previous.os_crypt }));
        }
      }
      for (const name of credentials) copyMissing(path.join(oldRoot, name), path.join(newRoot, name));
    }
  }
  const oldAccounts = path.join(oldRoot, 'accounts');
  if (fs.existsSync(oldAccounts)) {
    const newAccounts = path.join(newRoot, 'accounts');
    const existing = new Set(fs.existsSync(newAccounts) ? fs.readdirSync(newAccounts) : []);
    for (const entry of fs.readdirSync(oldAccounts, { withFileTypes: true })) {
      if (entry.isFile() && /^[a-f0-9]{64}\.json(?:\.backup|\.corrupted-\d+)?$/.test(entry.name)) {
        const target = path.join(newAccounts, entry.name);
        const primaryName = entry.name.replace(/\.backup$|\.corrupted-\d+$/, '');
        if (entry.name !== primaryName && existing.has(primaryName)) continue;
        copyMissing(path.join(oldAccounts, entry.name), target);
        if (entry.name.endsWith('.backup') && !fs.existsSync(path.join(oldAccounts, primaryName))) copyMissing(path.join(oldAccounts, entry.name), path.join(newAccounts, primaryName));
      }
    }
  }
  atomicWrite(marker, JSON.stringify({ version: 1, completedAt: new Date().toISOString() }));
}
