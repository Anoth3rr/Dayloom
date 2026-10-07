import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, randomUUID, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { DatabaseSync } from 'node:sqlite';
import { normalizeData } from '../shared/schema.mjs';
import { canonical, emptyData } from '../shared/sync-data.mjs';

const derive = promisify(scrypt);
const digest = value => createHash('sha256').update(value).digest('hex');
const sessionLifetime = 30 * 24 * 60 * 60 * 1000;
const bodyLimit = 20 * 1024 * 1024;
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const fail = (status, message) => { throw new HttpError(status, message); };
async function passwordHash(password, salt = randomBytes(16).toString('hex')) {
  const key = await derive(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `${salt}:${key.toString('hex')}`;
}
async function verifyPassword(password, encoded) {
  const [salt, hash] = encoded.split(':');
  const actual = (await passwordHash(password, salt)).split(':')[1];
  return timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(actual, 'hex'));
}
function credentials(body) {
  if (!body || typeof body.username !== 'string' || !/^[a-zA-Z0-9_.-]{3,32}$/.test(body.username)) fail(400, '用户名需为 3–32 位字母、数字、下划线、短横线或点');
  if (typeof body.password !== 'string' || body.password.length < 10 || body.password.length > 128) fail(400, '密码长度需为 10–128 个字符');
  return { username: body.username.toLowerCase(), password: body.password };
}
async function readBody(request) {
  if (!request.headers['content-type']?.startsWith('application/json')) fail(415, '请使用 JSON 请求');
  if (Number(request.headers['content-length']) > bodyLimit) fail(413, '数据不能超过 20 MB');
  const chunks = []; let length = 0;
  for await (const chunk of request) { length += chunk.length; if (length > bodyLimit) fail(413, '数据不能超过 20 MB'); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { fail(400, 'JSON 格式无效'); }
}
export function createDayloomServer({ database = ':memory:', staticDirectory, allowedOrigins = ['http://127.0.0.1:5173', 'http://localhost:5173'], registration = true, now = Date.now } = {}) {
  if (database !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(database)), { recursive: true });
  const db = new DatabaseSync(database, { timeout: 5000 });
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
    CREATE TABLE IF NOT EXISTS workspaces (user_id TEXT PRIMARY KEY REFERENCES users(id), revision INTEGER NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS mutations (user_id TEXT NOT NULL REFERENCES users(id), id TEXT NOT NULL, payload_hash TEXT NOT NULL, PRIMARY KEY(user_id,id));`);
  const attempts = new Map();
  let hashing = 0;
  const dummyHash = passwordHash('Dayloom-invalid-account-placeholder');
  const userInfo = user => ({ id: user.id, username: user.username, name: user.name });
  function limit(key, maximum) {
    const time = now();
    if (attempts.size > 10000) for (const [id, value] of attempts) if (value.until <= time) attempts.delete(id);
    if (attempts.size > 10000) fail(429, '请求较多，请稍后重试');
    let entry = attempts.get(key);
    if (!entry || entry.until <= time) { entry = { count: 0, until: time + 15 * 60 * 1000 }; attempts.set(key, entry); }
    if (++entry.count > maximum) fail(429, '尝试次数较多，请 15 分钟后重试');
  }
  async function withHash(work) {
    if (hashing >= 4) fail(503, '登录服务忙，请稍后重试');
    hashing++; try { return await work(); } finally { hashing--; }
  }
  function issueSession(user) {
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now());
    const token = randomBytes(32).toString('base64url'), expiresAt = now() + sessionLifetime;
    db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(digest(token), user.id, expiresAt);
    return { token, expiresAt, user: userInfo(user) };
  }
  function authorize(request) {
    const header = request.headers.authorization;
    if (typeof header !== 'string' || !/^Bearer [A-Za-z0-9_-]{43}$/.test(header)) fail(401, '请登录账号');
    const hash = digest(header.slice(7));
    const user = db.prepare('SELECT users.*, sessions.expires_at FROM sessions JOIN users ON users.id=sessions.user_id WHERE token_hash=? AND expires_at>?').get(hash, now());
    if (!user) fail(401, '登录已过期，请重新登录');
    return { user, hash };
  }
  function snapshot(id) {
    const row = db.prepare('SELECT revision,data,updated_at FROM workspaces WHERE user_id=?').get(id);
    return { revision: row.revision, data: JSON.parse(row.data), updatedAt: row.updated_at };
  }
  function json(response, status, data) {
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); response.end(JSON.stringify(data));
  }
  const server = http.createServer(async (request, response) => {
    try {
      const origin = request.headers.origin;
      let sameOrigin = false;
      if (origin) {
        try { const parsed = new URL(origin); sameOrigin = ['http:', 'https:'].includes(parsed.protocol) && parsed.origin === origin && parsed.host === request.headers.host; }
        catch { fail(403, '网页来源无效'); }
      }
      if (origin && !sameOrigin && !allowedOrigins.includes(origin)) fail(403, '此网页来源未被服务端允许');
      if (origin) { response.setHeader('Access-Control-Allow-Origin', origin); response.setHeader('Vary', 'Origin'); }
      if (request.method === 'OPTIONS') {
        response.writeHead(204, { 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,Authorization', 'Access-Control-Max-Age': '600' }); response.end(); return;
      }
      const url = new URL(request.url, 'http://dayloom.local');
      const route = url.pathname, method = request.method;
      if (route === '/api/health' && method === 'GET') return json(response, 200, { service: 'Dayloom', version: '1.3.0', registration });
      if (['/api/auth/register', '/api/auth/login'].includes(route) && method === 'POST') {
        const body = await readBody(request);
        const { username, password } = credentials(body);
        limit(`address:${request.socket.remoteAddress}`, 60); limit(`account:${username}`, 20);
        if (route.endsWith('/register')) {
          if (!registration) fail(403, '服务端已关闭新用户注册');
          if (body.name !== undefined && typeof body.name !== 'string') fail(400, '昵称格式不正确');
          const name = body.name?.trim() || username;
          if (typeof name !== 'string' || name.length > 40) fail(400, '昵称不能超过 40 个字符');
          if (db.prepare('SELECT 1 FROM users WHERE username=?').get(username)) fail(409, '该用户名已注册');
          const encoded = await withHash(() => passwordHash(password));
          const user = { id: randomUUID(), username, name };
          db.exec('BEGIN IMMEDIATE');
          try {
            if (db.prepare('SELECT 1 FROM users WHERE username=?').get(username)) fail(409, '该用户名已注册');
            db.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run(user.id, username, name, encoded, now());
            db.prepare('INSERT INTO workspaces VALUES (?,0,?,?)').run(user.id, JSON.stringify(emptyData()), now());
            const session = issueSession(user); db.exec('COMMIT'); return json(response, 201, session);
          } catch (error) { db.exec('ROLLBACK'); throw error; }
        }
        const user = db.prepare('SELECT * FROM users WHERE username=?').get(username);
        const valid = await withHash(async () => verifyPassword(password, user?.password || await dummyHash));
        if (!user || !valid || db.prepare('SELECT password FROM users WHERE id=?').get(user.id)?.password !== user.password) fail(401, '用户名或密码不正确');
        attempts.delete(`account:${username}`);
        return json(response, 200, issueSession(user));
      }
      if (route.startsWith('/api/')) {
        const { user, hash } = authorize(request);
        if (route === '/api/auth/me' && method === 'GET') return json(response, 200, { user: userInfo(user), expiresAt: user.expires_at });
        if (route === '/api/auth/logout' && method === 'POST') { db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash); return json(response, 200, { ok: true }); }
        if (route === '/api/auth/password' && method === 'POST') {
          limit(`password:${user.id}`, 10);
          const body = await readBody(request);
          if (!body || typeof body.currentPassword !== 'string' || body.currentPassword.length > 128) fail(400, '请输入当前密码');
          credentials({ username: user.username, password: body.password });
          const valid = await withHash(() => verifyPassword(body.currentPassword, user.password));
          if (!valid) fail(403, '当前密码不正确');
          const encoded = await withHash(() => passwordHash(body.password));
          db.exec('BEGIN IMMEDIATE');
          try {
            if (db.prepare('SELECT password FROM users WHERE id=?').get(user.id)?.password !== user.password || !db.prepare('SELECT 1 FROM sessions WHERE token_hash=?').get(hash)) fail(401, '登录状态已改变，请重新登录');
            db.prepare('UPDATE users SET password=? WHERE id=?').run(encoded, user.id);
            db.prepare('DELETE FROM sessions WHERE user_id=? AND token_hash<>?').run(user.id, hash);
            db.exec('COMMIT');
          } catch (error) { db.exec('ROLLBACK'); throw error; }
          return json(response, 200, { ok: true });
        }
        if (route === '/api/sync' && method === 'GET') {
          const state = snapshot(user.id);
          return json(response, 200, { ...state, data: url.searchParams.get('revision') === String(state.revision) ? null : state.data });
        }
        if (route === '/api/sync' && method === 'POST') {
          const body = await readBody(request);
          authorize(request); // Recheck after receiving the body in case another device revoked this session.
          if (!body || !Number.isSafeInteger(body.revision) || body.revision < 0 || typeof body.id !== 'string' || !/^[\da-f-]{36}$/i.test(body.id)) fail(400, '同步版本或请求编号无效');
          let data;
          try { data = normalizeData(body.data); } catch (error) { fail(400, error.message); }
          const payloadHash = digest(canonical({ revision: body.revision, data }));
          db.exec('BEGIN IMMEDIATE');
          try {
            const previous = db.prepare('SELECT payload_hash FROM mutations WHERE user_id=? AND id=?').get(user.id, body.id);
            if (previous) {
              if (previous.payload_hash !== payloadHash) fail(409, '请求编号已经用于其他同步内容');
              const state = snapshot(user.id); db.exec('COMMIT'); return json(response, 200, state);
            }
            const state = snapshot(user.id);
            if (state.revision !== body.revision) { db.exec('ROLLBACK'); return json(response, 409, { error: '同步版本已更新', ...state }); }
            db.prepare('UPDATE workspaces SET revision=revision+1,data=?,updated_at=? WHERE user_id=?').run(JSON.stringify(data), now(), user.id);
            db.prepare('INSERT INTO mutations VALUES (?,?,?)').run(user.id, body.id, payloadHash);
            const saved = snapshot(user.id); db.exec('COMMIT'); return json(response, 200, saved);
          } catch (error) { db.exec('ROLLBACK'); throw error; }
        }
        fail(404, '接口不存在');
      }
      if (staticDirectory && method === 'GET') {
        const relative = route === '/' ? 'index.html' : decodeURIComponent(route).replace(/^\/+/, '');
        const root = path.resolve(staticDirectory), file = path.resolve(root, relative);
        if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) fail(404, '页面不存在');
        const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' }[path.extname(file)] || 'application/octet-stream';
        response.writeHead(200, { 'Content-Type': mime, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cache-Control': path.extname(file) === '.html' ? 'no-cache' : 'public,max-age=3600' });
        fs.createReadStream(file).pipe(response); return;
      }
      fail(404, '页面不存在');
    } catch (error) {
      if (!response.headersSent) json(response, error.status || 500, { error: error.status ? error.message : '服务暂时无法处理请求' });
      else response.end();
      if (!error.status) console.error('Dayloom request failed:', error.message);
    }
  });
  server.requestTimeout = 30000; server.headersTimeout = 10000;
  server.on('close', () => db.close());
  return server;
}
