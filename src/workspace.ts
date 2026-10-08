import { emptyData, equal, mergeData, normalizeEndpoint } from '../shared/sync-data.mjs';
import { uuid } from '../shared/uuid.mjs';
import { profileKey } from '../shared/account-service.mjs';
import type { WebdavCredentials } from '../shared/webdav.mjs';
import { validateData } from './domain';
import type { AppData } from './types';
import type { AccountCall, AccountSession, ApiResponse, WorkspaceAdapter, WorkspaceEnvelope, WorkspaceState } from './account-types';

class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
function checked(result: ApiResponse) {
  if (result.status >= 400) throw new ApiError(result.status, String(result.body.error || '账号服务暂时无法使用'));
  return result.body;
}
export class WorkspaceController {
  private state: WorkspaceState = { data: null, session: null, accounts: [], path: '', saveStatus: '正在读取', syncStatus: 'local', syncError: '', busy: false, loadError: '' };
  private clientId = uuid();
  private sequence = 0;
  private listeners = new Set<() => void>();
  private envelope: WorkspaceEnvelope | null = null;
  private key: string | null = null;
  private generation = 0;
  private writes: Promise<void> = Promise.resolve();
  private writeId = 0;
  private initialization?: Promise<void>;
  private running?: { generation: number; promise: Promise<void> };
  private timer?: ReturnType<typeof setInterval>;
  private debounce?: ReturnType<typeof setTimeout>;
  constructor(private adapter: WorkspaceAdapter, private options: { automatic?: boolean; intervalMs?: number } = {}) {}
  getSnapshot = () => this.state;
  subscribe = (callback: () => void) => { this.listeners.add(callback); return () => { this.listeners.delete(callback); }; };
  private emit(patch: Partial<WorkspaceState>) { this.state = { ...this.state, ...patch }; for (const notify of this.listeners) notify(); }
  private notice(message: string) { this.emit({ notice: { id: (this.state.notice?.id || 0) + 1, message } }); }
  start = () => this.initialization ||= this.initialize();
  private async initialize() {
    try {
      const session = await this.adapter.session();
      this.emit({ session });
      await this.open(session);
      await this.refreshAccounts();
      this.startTimer();
      if (session && this.options.automatic !== false) void this.syncNow();
    } catch (error) { this.emit({ loadError: String((error as Error).message || error) }); }
  }
  private async open(session: AccountSession | null) {
    this.key = session ? profileKey(session) : null;
    if (!this.key) {
      const loaded = await this.adapter.loadGuest(); this.envelope = null;
      this.emit({ data: validateData(loaded.data), session: null, path: loaded.path, syncStatus: 'local', syncError: '', lastSyncedAt: undefined, loadError: '' });
      if (loaded.warning) this.notice(loaded.warning);
    } else {
      const loaded = await this.adapter.loadProfile(this.key);
      this.envelope = loaded.envelope || { version: 1, data: emptyData(), sync: { revision: 0, base: emptyData() } };
      this.envelope.data = validateData(this.envelope.data);
      this.emit({ data: this.envelope.data, session, path: loaded.path, syncStatus: 'pending', syncError: '', lastSyncedAt: this.envelope.sync.lastSyncedAt, loadError: '' });
      if (loaded.warning) this.notice(loaded.warning);
    }
    await this.persist();
  }
  private startTimer() {
    if (this.options.automatic === false || !this.state.session || this.state.syncStatus === 'expired') return;
    clearInterval(this.timer);
    this.timer = setInterval(() => { void this.syncNow(); }, this.options.intervalMs || 15000);
  }
  stop() { clearInterval(this.timer); clearTimeout(this.debounce); this.generation++; }
  private schedule() {
    if (!this.state.session || this.options.automatic === false) return;
    clearTimeout(this.debounce); this.debounce = setTimeout(() => { void this.syncNow(); }, 700);
  }
  private persist() {
    if (!this.state.data) return Promise.resolve();
    const generation = this.generation, id = ++this.writeId, key = this.key;
    const data = structuredClone(this.state.data);
    const envelope = this.envelope ? structuredClone({ ...this.envelope, data }) : null;
    this.emit({ saveStatus: '正在保存' });
    const work = this.writes.catch(() => {}).then(() => key && envelope ? this.adapter.saveProfile(key, envelope) : this.adapter.saveGuest(data));
    this.writes = work;
    void work.then(() => { if (generation === this.generation && id === this.writeId) this.emit({ saveStatus: '已保存到本地' }); }, error => {
      if (generation === this.generation) { this.emit({ saveStatus: '保存失败' }); this.notice(`本地保存失败，请导出备份：${error.message || error}`); }
    });
    return work;
  }
  update = (change: (data: AppData) => AppData) => {
    if (!this.state.data || this.state.busy) return false;
    try {
      const data = validateData(change(this.state.data));
      if (this.envelope) this.envelope = { ...this.envelope, data };
      this.emit({ data, ...(this.state.session ? { syncStatus: this.state.syncStatus === 'expired' ? 'expired' as const : 'pending' as const } : {}) });
      void this.persist().catch(() => {}); this.schedule(); return true;
    } catch (error) { this.notice((error as Error).message); return false; }
  };
  flush = (): true | string => {
    if (!this.state.data) return true;
    return this.key && this.envelope ? this.adapter.flushProfile(this.key, { ...this.envelope, data: this.state.data }) : this.adapter.flushGuest(this.state.data);
  };
  private applyRemote(remote: AppData, revision: number, mergeBase: AppData) {
    let result;
    try { result = mergeData(mergeBase, this.state.data!, remote); }
    catch (error) { throw new ApiError(422, `同步合并需要检查：${(error as Error).message}。本机修改已保留。`); }
    this.envelope = { version: 1, data: result.data, sync: { revision, base: remote, lastSyncedAt: Date.now() } };
    this.emit({ data: result.data, lastSyncedAt: this.envelope.sync.lastSyncedAt });
    if (result.conflicts) this.notice(`有 ${result.conflicts} 项多端修改冲突，副本已保存在收集箱。`);
  }
  syncNow = async () => {
    if (!this.state.session || !this.state.data || !this.envelope || this.state.syncStatus === 'expired') return;
    const generation = this.generation;
    if (this.running?.generation === generation) return this.running.promise;
    const work = this.synchronize(generation);
    this.running = { generation, promise: work };
    try { await work; } finally { if (this.running?.promise === work) this.running = undefined; }
  };
  private async synchronize(generation: number) {
    const current = () => generation === this.generation && !!this.state.session && !!this.envelope;
    this.emit({ syncStatus: 'syncing', syncError: '' });
    try {
      for (let attempt = 0; attempt < 6 && current(); attempt++) {
        // Retry a persisted request before pulling; an earlier response may have been lost.
        if (!this.envelope!.sync.pending) {
          const response = await this.adapter.call({ operation: 'pull', revision: this.envelope!.sync.revision });
          if (!current()) return;
          const remote = checked(response);
          if (!Number.isSafeInteger(remote.revision) || Number(remote.revision) < 0) throw new Error('同步服务返回的版本无效');
          if (remote.data) {
            this.applyRemote(validateData(remote.data), Number(remote.revision), this.envelope!.sync.base);
            await this.persist(); if (!current()) return;
          }
          if (equal(this.state.data, this.envelope!.sync.base)) {
            const lastSyncedAt = Date.now(); this.envelope!.sync.lastSyncedAt = lastSyncedAt;
            this.emit({ syncStatus: 'synced', lastSyncedAt }); return;
          }
          this.envelope!.sync.pending = { id: uuid(), revision: this.envelope!.sync.revision, data: structuredClone(this.state.data!), ...(this.state.session?.provider === 'webdav' ? { clientId: this.clientId, sequence: ++this.sequence } : {}) };
          await this.persist(); if (!current()) return;
        }
        const pending = structuredClone(this.envelope!.sync.pending!);
        const response = await this.adapter.call({ operation: 'push', body: pending });
        if (!current()) return;
        if (!Number.isSafeInteger(response.body.revision) || Number(response.body.revision) < 0 || !response.body.data) { checked(response); throw new Error('同步响应格式无效'); }
        if (response.status === 409 && response.body.data) {
          this.applyRemote(validateData(response.body.data), Number(response.body.revision), this.envelope!.sync.base);
        } else {
          const remote = checked(response);
          if (!Number.isSafeInteger(remote.revision) || Number(remote.revision) < 0) throw new Error('同步版本无效');
          this.applyRemote(validateData(remote.data), Number(remote.revision), pending.data);
        }
        await this.persist(); if (!current()) return;
        if (equal(this.state.data, this.envelope!.sync.base)) { this.emit({ syncStatus: 'synced' }); return; }
      }
      if (current()) { this.emit({ syncStatus: 'pending' }); this.schedule(); }
    } catch (error) {
      if (!current()) return;
      const status = error instanceof ApiError ? error.status : 0;
      if (status === 401) clearInterval(this.timer);
      this.emit({ syncStatus: status === 401 ? 'expired' : status ? 'error' : 'offline', syncError: status ? (error as Error).message : '暂时无法连接同步服务，修改已留在本机，稍后自动重试。' });
    }
  }
  private async refreshAccounts() {
    const result = await this.adapter.call({ operation: 'accounts' });
    if (result.status < 300 && Array.isArray(result.body.accounts)) this.emit({ accounts: result.body.accounts as AccountSession[] });
  }
  checkWebdav = async (endpoint: string, credentials: WebdavCredentials) => {
    checked(await this.adapter.call({ operation: 'webdav-check', endpoint, body: credentials }));
  };
  connectWebdav = (endpoint: string, credentials: WebdavCredentials, mergeCurrent: boolean) => this.enterAccount({ operation: 'webdav-connect', endpoint, body: credentials }, mergeCurrent);
  switchAccount = (session: AccountSession) => this.enterAccount({ operation: 'switch', body: { key: profileKey(session) } }, false);
  forgetAccount = async (session: AccountSession) => {
    checked(await this.adapter.call({ operation: 'forget', body: { key: profileKey(session) } }));
    await this.refreshAccounts(); this.notice('已移除保存的账号凭据，本地缓存仍保留。');
  };
  login = (operation: 'login' | 'register', endpoint: string, username: string, password: string, name: string, mergeGuest: boolean) => this.enterAccount({ operation, endpoint: normalizeEndpoint(endpoint), body: { username, password, name } }, mergeGuest);
  private async enterAccount(request: AccountCall, mergeCurrent: boolean) {
    if (this.state.busy) return;
    this.stop(); const previous = this.state; this.emit({ busy: true });
    let authenticated = false;
    try {
      await this.writes;
      const guest = mergeCurrent ? structuredClone(previous.data) : null;
      const result = checked(await this.adapter.call(request));
      const session = result.session as AccountSession;
      if (!session?.user?.id) throw new Error('登录响应无效');
      authenticated = true; this.emit({ data: null, session, loadError: '' });
      await this.open(session);
      await this.refreshAccounts();
      await this.syncNow();
      if (guest && (!previous.session || profileKey(previous.session) !== profileKey(session))) {
        const imported = { ...guest, tasks: guest.tasks.filter(task => !task.example), settings: this.state.data!.settings };
        const result = mergeData(emptyData(), imported, this.state.data!);
        this.envelope!.data = result.data; this.emit({ data: result.data, syncStatus: 'pending' }); await this.persist(); await this.syncNow();
      }
      this.startTimer(); this.notice(request.operation === 'webdav-connect' ? 'WebDAV 账号已连接' : request.operation === 'switch' ? '已切换账号' : request.operation === 'register' ? '账号已创建' : '已登录账号');
    } catch (error) {
      if (!authenticated) { this.emit(previous); this.startTimer(); }
      else this.emit({ data: null, loadError: (error as Error).message });
      throw error;
    } finally { this.emit({ busy: false }); }
  };
  logout = async () => {
    if (this.state.busy) return;
    this.stop(); this.emit({ busy: true });
    try {
      await this.writes;
      await this.adapter.call({ operation: 'logout' });
      this.emit({ data: null, session: null }); await this.open(null); this.notice('已返回本地模式，账号缓存与连接配置已保留。');
    } finally { this.emit({ busy: false }); }
  };
  changePassword = async (currentPassword: string, password: string) => {
    checked(await this.adapter.call({ operation: 'password', body: { currentPassword, password } }));
    this.notice('密码已修改，其他设备需要重新登录。');
  };
}
