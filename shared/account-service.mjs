import { accountHttp, authenticatedSession } from './account-http.mjs';
import { createWebdavClient, webdavSession } from './webdav.mjs';

export const profileKey = session => session.provider === 'webdav'
  ? JSON.stringify(['webdav', session.endpoint, session.user.id, session.folder])
  : `${session.endpoint}\0${session.user.id}`;
export const publicAccount = session => session ? {
  endpoint: session.endpoint, user: session.user, expiresAt: session.expiresAt,
  remembered: session.remembered ?? false,
  ...(session.provider === 'webdav' ? { provider: 'webdav', folder: session.folder } : {}),
} : null;
function validateSession(value) {
  return value.provider === 'webdav'
    ? webdavSession(value.endpoint, { ...value, username: value.user?.username, name: value.user?.name })
    : authenticatedSession(value.endpoint, value);
}
// The desktop supplies an OS-encrypted vault; the browser uses tab session storage.
// Neither public session responses nor workspace files contain credentials.
export function createAccountService({ load, save, fetcher = fetch }) {
  let vault, remembered = false;
  const dav = createWebdavClient(fetcher);
  function state() {
    if (vault) return vault;
    const loaded = load();
    if (!loaded) return vault = { version: 1, active: null, accounts: [] };
    const value = loaded.value;
    if (!value || value.version !== 1 || !Array.isArray(value.accounts) || value.accounts.length > 30) throw new Error('账号配置无法读取，原文件已保留');
    const accounts = value.accounts.map(validateSession);
    if (new Set(accounts.map(profileKey)).size !== accounts.length || (value.active !== null && !accounts.some(account => profileKey(account) === value.active))) throw new Error('账号配置编号无效，原文件已保留');
    remembered = loaded.remembered;
    return vault = { version: 1, active: value.active, accounts };
  }
  function active() { return state().accounts.find(account => profileKey(account) === state().active) || null; }
  function persist(value) { remembered = save(value); vault = value; }
  const expose = account => publicAccount(account ? { ...account, remembered } : null);
  function result() { return { status: 200, body: { session: expose(active()), accounts: state().accounts.map(expose) } }; }
  return {
    session: () => expose(active()),
    active,
    async call(request) {
      if (!request || typeof request.operation !== 'string') throw new Error('账号请求无效');
      const current = active();
      if (request.operation === 'accounts') return result();
      if (request.operation === 'switch') {
        const key = request.body?.key;
        if (!state().accounts.some(account => profileKey(account) === key)) throw new Error('此账号未保存，请先连接');
        persist({ ...state(), active: key }); return result();
      }
      if (request.operation === 'forget') {
        const key = request.body?.key;
        if (key === state().active) throw new Error('请先返回本地模式，再移除当前账号');
        persist({ ...state(), accounts: state().accounts.filter(account => profileKey(account) !== key) }); return result();
      }
      if (request.operation === 'logout') {
        persist({ ...state(), active: null });
        return result();
      }
      if (['webdav-connect', 'webdav-test', 'login', 'register'].includes(request.operation)) {
        const isDav = request.operation.startsWith('webdav-');
        const candidate = isDav ? webdavSession(request.endpoint, request.body) : null;
        const response = isDav ? await dav.call(request, candidate) : await accountHttp(request, current, fetcher);
        if (response.status >= 300 || request.operation === 'webdav-test') return response;
        const account = candidate || authenticatedSession(request.endpoint, response.body);
        const key = profileKey(account), accounts = state().accounts.filter(item => profileKey(item) !== key);
        if (accounts.length >= 30) throw new Error('最多保存 30 个账号，请先移除不再使用的账号');
        persist({ version: 1, active: key, accounts: [...accounts, account] });
        return result();
      }
      return current?.provider === 'webdav' ? dav.call(request, current) : accountHttp(request, current, fetcher);
    },
  };
}
