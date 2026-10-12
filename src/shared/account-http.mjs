import { normalizeEndpoint } from './sync-data.mjs';

export async function accountHttp(request, session, fetcher = fetch) {
  const publicCall = ['register', 'login'].includes(request.operation);
  if (!publicCall && !session) return { status: 401, body: { error: '请先登录账号' } };
  const endpoint = normalizeEndpoint(publicCall ? request.endpoint : session.endpoint);
  const routes = { register: 'auth/register', login: 'auth/login', pull: 'sync', push: 'sync', password: 'auth/password', logout: 'auth/logout' };
  const route = routes[request.operation];
  if (!route) throw new Error('不支持的账号操作');
  const query = request.operation === 'pull' && Number.isSafeInteger(request.revision) ? `?revision=${request.revision}` : '';
  const response = await fetcher(`${endpoint}/api/${route}${query}`, {
    method: request.operation === 'pull' ? 'GET' : 'POST',
    headers: { ...(request.operation === 'pull' ? {} : { 'Content-Type': 'application/json' }), ...(!publicCall ? { Authorization: `Bearer ${session.token}` } : {}) },
    ...(request.operation === 'pull' ? {} : { body: JSON.stringify(request.body || {}) }),
    redirect: 'error', signal: AbortSignal.timeout(15000),
  });
  const reader = response.body?.getReader();
  if (!reader) throw new Error('同步服务未返回数据');
  let size = 0; const chunks = [];
  try {
    while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > 22 * 1024 * 1024) throw new Error('同步服务返回的数据过大'); chunks.push(part.value); }
  } finally { if (size > 22 * 1024 * 1024) await reader.cancel(); reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const part of chunks) { bytes.set(part, offset); offset += part.byteLength; }
  let body;
  try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new Error('服务地址没有返回有效的 Dayloom 数据'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('同步服务响应格式不正确');
  return { status: response.status, body };
}
export function authenticatedSession(endpoint, body) {
  if (typeof body.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(body.token) || !body.user || typeof body.user.id !== 'string' || !/^[\da-f-]{36}$/i.test(body.user.id) || typeof body.user.username !== 'string' || !/^[a-zA-Z0-9_.-]{3,32}$/.test(body.user.username) || typeof body.user.name !== 'string' || !body.user.name.trim() || body.user.name.length > 40 || !Number.isSafeInteger(body.expiresAt) || body.expiresAt < 1) throw new Error('登录响应格式不正确');
  return { endpoint: normalizeEndpoint(endpoint), token: body.token, user: { id: body.user.id, username: body.user.username, name: body.user.name }, expiresAt: body.expiresAt };
}
export const publicSession = session => session ? { endpoint: session.endpoint, user: session.user, expiresAt: session.expiresAt, remembered: session.remembered ?? false } : null;
