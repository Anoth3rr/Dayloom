import { normalizeData } from './schema.mjs';
import { emptyData } from './sync-data.mjs';
import { uuid } from './uuid.mjs';

const MAX_BYTES = 22 * 1024 * 1024;
const isId = value => typeof value === 'string' && /^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(value);
const strongEtag = value => typeof value === 'string' && /^"[\x21\x23-\x7e\x80-\xff]*"$/.test(value);
class DavError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export function normalizeWebdavEndpoint(value) {
  if (typeof value !== 'string' || value.length > 2048) throw new Error('请输入有效的 WebDAV 地址');
  let url;
  try { url = new URL(value.trim()); } catch { throw new Error('请输入完整的 WebDAV 地址，包括 https:// 和目录路径'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('WebDAV 地址不能包含密码、查询参数或片段');
  url.pathname = url.pathname.replace(/\/+$/, '') + '/';
  if (url.href.length > 2048) throw new Error('WebDAV 地址过长');
  return url.href;
}
export function webdavSession(endpoint, input) {
  if (!input || typeof input.username !== 'string' || (input.folder !== undefined && typeof input.folder !== 'string')) throw new Error('WebDAV 配置格式不正确');
  const username = input.username.trim(), password = input.password;
  const folder = (input.folder ?? 'Dayloom').trim().replace(/^\/+|\/+$/g, '');
  if (typeof username !== 'string' || !username || username.length > 256 || /[:\x00-\x1f\x7f]/.test(username)) throw new Error('请输入 WebDAV 用户名（不能包含冒号）');
  if (typeof password !== 'string' || !password || password.length > 2048) throw new Error('请输入 WebDAV 密码或应用密码');
  if (!folder || folder.length > 256 || folder.split('/').some(part => !part || part === '.' || part === '..') || /[\\\x00-\x1f\x7f]/.test(folder)) throw new Error('同步目录无效，例如 Dayloom 或 Apps/Dayloom');
  if (input.name !== undefined && (typeof input.name !== 'string' || input.name.length > 40)) throw new Error('账号名称最多 40 个字');
  return { provider: 'webdav', endpoint: normalizeWebdavEndpoint(endpoint), folder, password, user: { id: username, username, name: input.name?.trim() || username }, expiresAt: 0, locking: input.locking === true };
}
export function webdavDirectory(session) {
  return session.endpoint + session.folder.split('/').map(encodeURIComponent).join('/') + '/';
}
function auth(session) {
  const bytes = new TextEncoder().encode(`${session.user.username}:${session.password}`);
  return `Basic ${btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''))}`;
}
function fail(response) {
  const messages = { 401: 'WebDAV 用户名或密码无效，请更新凭据', 403: 'WebDAV 拒绝访问，请检查目录的读写权限', 404: 'WebDAV 地址或目录不存在', 405: '该地址不支持所需的 WebDAV 操作', 409: '无法创建同步目录，请检查 WebDAV 根目录地址', 423: 'WebDAV 文件被锁定，稍后将重试', 507: 'WebDAV 存储空间不足' };
  throw new DavError(response.status, messages[response.status] || `WebDAV 请求失败（HTTP ${response.status}）`);
}
async function bodyText(response) {
  if (Number(response.headers.get('content-length')) > MAX_BYTES) { await response.body?.cancel(); throw new DavError(422, 'WebDAV 同步文件过大'); }
  const reader = response.body?.getReader();
  if (!reader) throw new DavError(422, 'WebDAV 没有返回文件内容');
  let size = 0; const chunks = [];
  try {
    while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > MAX_BYTES) throw new DavError(422, 'WebDAV 同步文件过大'); chunks.push(part.value); }
  } finally { if (size > MAX_BYTES) await reader.cancel(); reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const part of chunks) { bytes.set(part, offset); offset += part.byteLength; }
  return new TextDecoder().decode(bytes);
}
function documentValue(value) {
  if (!value || value.format !== 'dayloom-webdav' || value.version !== 1 || !Number.isSafeInteger(value.revision) || value.revision < 1 || !value.receipts || typeof value.receipts !== 'object' || Array.isArray(value.receipts)) throw new Error('同步文件格式或版本不正确');
  for (const [client, receipt] of Object.entries(value.receipts)) {
    if (!isId(client) || !receipt || !Number.isSafeInteger(receipt.sequence) || receipt.sequence < 1 || !isId(receipt.id)) throw new Error('同步文件的请求记录无效');
  }
  return { ...value, data: normalizeData(value.data) };
}
export function createWebdavClient(fetcher = fetch) {
  async function request(session, url, method, headers = {}, body) {
    try {
      return await fetcher(url, { method, headers: { Authorization: auth(session), ...headers }, ...(body === undefined ? {} : { body }), redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000) });
    } catch { throw new Error('无法连接 WebDAV。请检查网络、完整目录地址及 HTTPS 证书；不接受地址跳转。浏览器还需服务端允许跨域访问。'); }
  }
  async function ensureDirectory(session) {
    let url = session.endpoint;
    for (const part of session.folder.split('/')) {
      url += encodeURIComponent(part) + '/';
      const response = await request(session, url, 'MKCOL');
      await response.body?.cancel();
      if (response.status !== 201 && response.status !== 405) fail(response);
    }
  }
  async function lock(session, url, optional = false) {
    for (let attempt = 0; attempt < 6; attempt++) {
      const started = Date.now();
      const response = await request(session, url, 'LOCK', { 'Content-Type': 'application/xml; charset=utf-8', Depth: '0', Timeout: 'Second-180' }, '<?xml version="1.0"?><d:lockinfo xmlns:d="DAV:"><d:lockscope><d:exclusive/></d:lockscope><d:locktype><d:write/></d:locktype><d:owner>Dayloom</d:owner></d:lockinfo>');
      const xml = [200, 201].includes(response.status) ? await bodyText(response) : '';
      if (!xml) await response.body?.cancel();
      if (optional && [405, 501].includes(response.status)) return null;
      if (response.status === 423 && attempt < 5) { await new Promise(resolve => setTimeout(resolve, 200 * (attempt + 1))); continue; }
      if (![200, 201].includes(response.status)) fail(response);
      const rawToken = (response.headers.get('lock-token') || '').replace(/^<([^<>]+)>$/, '$1');
      if (rawToken.length > 2000 || !/^[A-Za-z][A-Za-z0-9+.-]*:[^<>\s]+$/.test(rawToken)) throw new DavError(422, 'WebDAV 未返回有效的 Lock-Token；浏览器使用时需允许读取此响应头');
      const token = `<${rawToken}>`;
      // Extract only the scalar timeout; never resolve XML entities or resources.
      const xmlTimeout = /<(?:[\w.-]+:)?timeout\b[^>]*>\s*(Second-\d+)\s*<\/(?:[\w.-]+:)?timeout\s*>/i.exec(xml)?.[1];
      const timeout = /^Second-(\d+)$/i.exec(response.headers.get('timeout') || xmlTimeout || '');
      const seconds = Number(timeout?.[1] || 0);
      const lease = { url, token, expiresAt: started + seconds * 1000 };
      if (!Number.isSafeInteger(seconds) || seconds > 3600 || lease.expiresAt < Date.now() + 60000) {
        await unlock(session, lease);
        throw new DavError(422, 'WebDAV 需提供至少 60 秒的有限锁超时');
      }
      return lease;
    }
  }
  async function unlock(session, lease) {
    const response = await request(session, lease.url, 'UNLOCK', { 'Lock-Token': lease.token });
    await response.body?.cancel();
    if (![200, 204, 404, 409].includes(response.status)) fail(response);
  }
  async function read(session, minimumRevision = 0) {
    const response = await request(session, webdavDirectory(session) + 'workspace.json', 'GET');
    if (response.status === 404) {
      await response.body?.cancel();
      if (minimumRevision > 0) throw new DavError(409, '云端同步文件已被移除。本机数据已保留，请恢复云端备份，或使用新目录并勾选合并当前任务。');
      return { document: { revision: 0, data: emptyData(), receipts: {} }, etag: null, size: 0 };
    }
    if (response.status !== 200) { await response.body?.cancel(); fail(response); }
    const etag = response.headers.get('etag');
    if (!strongEtag(etag)) { await response.body?.cancel(); throw new DavError(422, 'WebDAV 未提供有效的 ETag，无法安全合并多设备修改；浏览器使用时还需允许读取 ETag 响应头。'); }
    let document, size;
    try { const text = await bodyText(response); size = new TextEncoder().encode(text).byteLength; document = documentValue(JSON.parse(text)); }
    catch (error) { throw new DavError(422, `无法读取 WebDAV 同步文件：${error.message}。未覆盖云端文件。`); }
    if (document.revision < minimumRevision) throw new DavError(409, '云端版本早于本机记录，可能恢复过旧备份。请使用新同步目录并合并当前任务。');
    if (document.coordination && document.coordination !== (session.locking ? 'lock' : 'etag')) throw new DavError(422, '此同步目录使用的 WebDAV 锁能力与当前连接不一致，请更新连接配置或迁移到新目录');
    return { document, etag, size };
  }
  async function probe(session) {
    await ensureDirectory(session);
    const url = webdavDirectory(session) + `dayloom-check-${uuid()}.json`;
    const first = JSON.stringify({ check: uuid() }), second = JSON.stringify({ check: uuid() }) + ' ';
    let created = false;
    try {
      let response = await request(session, url, 'PUT', { 'Content-Type': 'application/json', 'If-None-Match': '*' }, first);
      await response.body?.cancel();
      if (![200, 201, 204].includes(response.status)) fail(response);
      created = true;
      response = await request(session, url, 'GET');
      if (response.status !== 200) { await response.body?.cancel(); fail(response); }
      const etag = response.headers.get('etag');
      if (await bodyText(response) !== first || !strongEtag(etag)) throw new DavError(422, 'WebDAV 必须支持文件读写和强 ETag；浏览器还需允许读取 ETag 响应头。');
      const lease = await lock(session, url, true);
      session.locking = !!lease;
      if (lease) await unlock(session, lease);
      for (const condition of [{ 'If-Match': `"dayloom-missing-${uuid()}"` }, { 'If-None-Match': '*' }]) {
        response = await request(session, url, 'PUT', { 'Content-Type': 'application/json', ...condition }, second);
        await response.body?.cancel();
        if (response.status !== 412) throw new DavError(422, '该 WebDAV 服务不支持条件写入，无法保证多设备同步安全。请使用支持 If-Match / If-None-Match 的服务。');
      }
      response = await request(session, url, 'PUT', { 'Content-Type': 'application/json', 'If-Match': etag }, second);
      await response.body?.cancel();
      if (![200, 201, 204].includes(response.status)) fail(response);
      response = await request(session, url, 'GET');
      if (response.status !== 200) { await response.body?.cancel(); fail(response); }
      if (await bodyText(response) !== second || !strongEtag(response.headers.get('etag')) || response.headers.get('etag') === etag) throw new DavError(422, 'WebDAV 文件版本校验失败，请检查服务端缓存配置');
      if (!session.locking) {
        const tag = response.headers.get('etag');
        const race = await Promise.all([
          request(session, url, 'PUT', { 'Content-Type': 'application/json', 'If-Match': tag }, first + '  '),
          request(session, url, 'PUT', { 'Content-Type': 'application/json', 'If-Match': tag }, second + '   '),
        ]);
        for (const result of race) await result.body?.cancel();
        if (race.filter(result => [200, 201, 204].includes(result.status)).length !== 1 || race.filter(result => result.status === 412).length !== 1) throw new DavError(422, 'WebDAV 并发写入校验失败。服务需支持独占锁，或原子执行条件写入。');
      }
      await read(session);
    } finally {
      if (created) {
        try { const cleanup = await request(session, url, 'DELETE'); await cleanup.body?.cancel(); } catch { /* Only a randomly named check file may remain after a network failure. */ }
      }
    }
  }
  async function call(requestValue, session) {
    let lease;
    try {
      if (!session) return { status: 401, body: { error: '请先连接 WebDAV 账号' } };
      if (requestValue.operation === 'webdav-test' || requestValue.operation === 'webdav-connect') { await probe(session); return { status: 200, body: { ok: true } }; }
      const pending = requestValue.body;
      if (requestValue.operation === 'push') {
        if (!pending || !isId(pending.id) || !isId(pending.clientId) || !Number.isSafeInteger(pending.sequence) || pending.sequence < 1 || !Number.isSafeInteger(pending.revision) || pending.revision < 0) throw new DavError(422, '待同步请求无效');
        normalizeData(pending.data);
      } else if (requestValue.operation !== 'pull') throw new DavError(400, '不支持的 WebDAV 操作');
      if (session.locking) lease = await lock(session, webdavDirectory(session) + 'sync.lock');
      const { document, etag, size } = await read(session, requestValue.operation === 'push' ? pending.revision : requestValue.revision || 0);
      const reply = (status, doc) => ({ status, body: { revision: doc.revision, data: doc.data } });
      if (requestValue.operation === 'pull') return reply(200, document);
      const receipt = document.receipts[pending.clientId];
      // One monotonically increasing stream per app run, retained without truncation.
      // Replaying a saved request after a lost response must never double-count progress.
      if (receipt?.sequence >= pending.sequence) {
        if (receipt.sequence === pending.sequence && receipt.id !== pending.id) throw new DavError(409, '同步请求编号重复，请重新打开应用后重试');
        return reply(200, document);
      }
      if (document.revision !== pending.revision) return reply(409, document);
      if (document.revision >= Number.MAX_SAFE_INTEGER) throw new DavError(422, '同步版本号已达到上限');
      const next = { format: 'dayloom-webdav', version: 1, coordination: session.locking ? 'lock' : 'etag', revision: document.revision + 1, data: normalizeData(pending.data), receipts: { ...document.receipts, [pending.clientId]: { sequence: pending.sequence, id: pending.id } } };
      let serialized = JSON.stringify(next);
      const bytes = new TextEncoder().encode(serialized).byteLength;
      // Some DAV servers use (second-resolution mtime, size) for strong ETags.
      // Strictly increasing byte length prevents repeated validators (including ABA)
      // during fast edits/deletions. JSON trailing whitespace is discarded on read.
      const padding = Math.max(0, size + 1 - bytes);
      if (bytes + padding > MAX_BYTES) throw new DavError(422, '同步文件超过 22 MB，请导出备份，并通过新目录合并当前任务继续同步');
      serialized += ' '.repeat(padding);
      if (lease && lease.expiresAt < Date.now() + 20000) throw new DavError(423, '同步锁即将过期，修改已保留，稍后重试');
      const response = await request(session, webdavDirectory(session) + 'workspace.json', 'PUT', { 'Content-Type': 'application/json', ...(etag ? { 'If-Match': etag } : { 'If-None-Match': '*' }) }, serialized);
      await response.body?.cancel();
      if (response.status === 412) return reply(409, (await read(session, pending.revision)).document);
      if (![200, 201, 204].includes(response.status)) fail(response);
      const confirmed = (await read(session, next.revision)).document;
      if (confirmed.receipts[pending.clientId]?.id !== pending.id) throw new DavError(502, 'WebDAV 未能确认写入结果，待同步请求已保留');
      return reply(200, confirmed);
    } catch (error) {
      if (error instanceof DavError) return { status: error.status, body: { error: error.message } };
      throw error;
    } finally {
      if (lease) { try { await unlock(session, lease); } catch { /* Finite leases also expire after a disconnect or crash. */ } }
    }
  }
  return { call };
}
