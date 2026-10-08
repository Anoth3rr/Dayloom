import { useState } from 'react';
import { CloudCheck, CloudOff, FolderSync, LoaderCircle, Plus, RefreshCw, Server, Settings2, Trash2, UserRound } from 'lucide-react';
import { profileKey } from '../../shared/account-service.mjs';
import type { WorkspaceController } from '../workspace';
import type { AccountSession, WorkspaceState } from '../account-types';
import { Confirm } from './ui';

export const syncLabels = { local: '本地模式', syncing: '正在同步', synced: '已同步', pending: '等待同步', offline: '离线 · 待同步', expired: '需要更新凭据', error: '同步未完成' };
export function AccountPanel({ controller, state }: { controller: WorkspaceController; state: WorkspaceState }) {
  const [formOpen, setFormOpen] = useState(!state.session && !state.accounts.length);
  const [legacy, setLegacy] = useState(false);
  const [endpoint, setEndpoint] = useState('');
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [folder, setFolder] = useState('Dayloom');
  const [password, setPassword] = useState('');
  const [mergeCurrent, setMergeCurrent] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [tested, setTested] = useState(false);
  const [forget, setForget] = useState<AccountSession | null>(null);
  const [leave, setLeave] = useState(false);
  const busy = working || state.busy;
  const credentials = { username, password, folder, name };
  const activeKey = state.session ? profileKey(state.session) : null;
  async function run(action: () => Promise<unknown>) {
    setWorking(true); setError('');
    try { await action(); } catch (error) { setError((error as Error).message); }
    finally { setWorking(false); }
  }
  function edit(account?: AccountSession) {
    setLegacy(!!account && account.provider !== 'webdav');
    setEndpoint(account?.endpoint || ''); setUsername(account?.user.username || '');
    setName(account?.user.name || ''); setFolder(account?.folder || 'Dayloom');
    setPassword(''); setTested(false); setError(''); setMergeCurrent(false); setFormOpen(true);
  }
  return <section className="settings-section account-section" aria-label="账号与同步">
    <div className="account-section-title"><h3>账号与同步</h3><span className="dav-label">WebDAV</span></div>
    <div className="account-card">
      <div className="account-heading"><div className="account-avatar"><UserRound size={24} /></div><div><strong>{state.session?.user.name || '本地模式'}</strong><p>{state.session ? state.session.provider === 'webdav' ? state.session.user.username : '旧版自部署账号' : '连接 WebDAV，在多台设备间同步'}</p></div>{state.session && <span className={`sync-badge ${state.syncStatus}`} role="status">{state.syncStatus === 'syncing' ? <LoaderCircle size={14} className="spinning" /> : state.syncStatus === 'synced' ? <CloudCheck size={14} /> : <CloudOff size={14} />}{syncLabels[state.syncStatus]}</span>}</div>
      {state.session && <>
        <div className="account-server"><Server size={15} /><span title={state.session.endpoint}>{state.session.endpoint}{state.session.provider === 'webdav' ? state.session.folder + '/' : ''}</span></div>
        <div className="sync-detail"><span>任务、清单、日程、周期事务和完成记录自动同步</span><small>{state.lastSyncedAt ? `最近同步：${new Date(state.lastSyncedAt).toLocaleString('zh-CN')}` : '尚未完成首次同步'}</small></div>
        {state.syncError && <p className="account-notice" role="status">{state.syncError}</p>}
        {state.session.provider !== 'webdav' && <p className="account-notice">添加 WebDAV 账号时，可勾选「合并当前任务」迁移数据。</p>}
        {window.desktop && !state.session.remembered && <p className="account-notice">系统加密存储当前不可用，本次关闭应用后需要重新输入凭据。</p>}
        <div className="account-actions"><button className="button primary" type="button" disabled={busy || state.syncStatus === 'syncing' || state.syncStatus === 'expired'} onClick={() => void run(controller.syncNow)}><RefreshCw size={15} />立即同步</button><button className="button secondary" type="button" disabled={busy} onClick={() => edit(state.session!)}><Settings2 size={15} />更新连接</button><button className="account-logout" type="button" disabled={busy} onClick={() => setLeave(true)}>本地模式</button></div>
      </>}
      {!!state.accounts.length && <div className="saved-accounts" aria-label="已保存的账号">
        <div className="saved-accounts-title">已保存的账号<span>{state.accounts.length}</span></div>
        {state.accounts.map(account => {
          const key = profileKey(account), active = key === activeKey;
          return <div key={key} className={`saved-account ${active ? 'active' : ''}`}>
            <button className="account-switch" type="button" aria-label={`切换到 ${account.user.name}`} disabled={busy || active} onClick={() => void run(() => controller.switchAccount(account))}><FolderSync size={18} /><span><strong>{account.user.name}</strong><small title={`${account.endpoint}${account.folder || ''}`}>{account.provider === 'webdav' ? account.folder : '旧版服务'} · {account.user.username}</small></span><b>{active ? '当前' : '切换'}</b></button>
            <button className="icon-button" type="button" title="更新连接" aria-label={`更新 ${account.user.name} 的连接`} disabled={busy} onClick={() => edit(account)}><Settings2 size={15} /></button>
            {!active && <button className="icon-button" type="button" title="移除账号" aria-label={`移除 ${account.user.name}`} disabled={busy} onClick={() => setForget(account)}><Trash2 size={15} /></button>}
          </div>;
        })}
      </div>}
      {!formOpen && <button className="button secondary add-account" type="button" disabled={busy} onClick={() => edit()}><Plus size={16} />添加 WebDAV 账号</button>}
      {formOpen && <form className="account-form dav-form" onChange={() => setTested(false)} onSubmit={event => {
        event.preventDefault();
        void run(async () => {
          if (legacy) await controller.login('login', endpoint, username, password, '', mergeCurrent);
          else await controller.connectWebdav(endpoint, credentials, mergeCurrent);
          setPassword(''); setFormOpen(false);
        });
      }}>
        <div className="dav-form-heading"><strong>{legacy ? '旧版服务登录' : '连接 WebDAV'}</strong><button className="text-button" type="button" disabled={busy} onClick={() => { setLegacy(!legacy); setEndpoint(''); setPassword(''); setTested(false); setError(''); }}>{legacy ? '使用 WebDAV' : '旧版服务登录'}</button></div>
        <fieldset disabled={busy}>
          <label className="form-label">{legacy ? '同步服务地址' : 'WebDAV 地址'}<input aria-label={legacy ? '同步服务地址' : 'WebDAV 地址'} type="url" autoComplete="url" maxLength={2048} placeholder={legacy ? 'http://192.168.1.10:4318' : 'https://dav.example.com/remote.php/dav/files/用户名/'} required value={endpoint} onChange={event => setEndpoint(event.target.value)} /></label>
          {!legacy && <div className="account-fields"><label className="form-label">账号名称<input aria-label="账号名称" maxLength={40} placeholder="例如：个人、工作" value={name} onChange={event => setName(event.target.value)} /></label><label className="form-label">同步目录<input aria-label="同步目录" maxLength={256} required value={folder} onChange={event => setFolder(event.target.value)} /></label></div>}
          <div className="account-fields"><label className="form-label">用户名<input aria-label="账号用户名" autoComplete="username" maxLength={256} required value={username} onChange={event => setUsername(event.target.value)} /></label><label className="form-label">{legacy ? '密码' : '密码 / 应用密码'}<input aria-label="账号密码" type="password" autoComplete="current-password" maxLength={2048} required value={password} onChange={event => setPassword(event.target.value)} /></label></div>
          {!legacy && <p className="account-help">使用已有的 WebDAV 账号；各设备填写相同地址、账号和同步目录。</p>}
          <label className="account-import"><input aria-label="合并当前任务" type="checkbox" checked={mergeCurrent} onChange={event => setMergeCurrent(event.target.checked)} />将当前任务合并到此账号<span>包含清单、周期事务和完成记录；原空间保留</span></label>
          <div className="dav-form-actions">{!legacy && <button className="button secondary" type="button" onClick={event => { if (event.currentTarget.form?.reportValidity()) void run(async () => { await controller.testWebdav(endpoint, credentials); setTested(true); }); }}>测试连接</button>}<button className="button primary" type="submit">{busy ? <LoaderCircle size={16} className="spinning" /> : <FolderSync size={16} />}{busy ? '正在连接…' : legacy ? '登录并同步' : '连接并同步'}</button><button className="text-button" type="button" onClick={() => { setFormOpen(false); setPassword(''); setError(''); }}>取消</button></div>
        </fieldset>
        {tested && <p className="account-test-ok" role="status"><CloudCheck size={16} />连接成功，可以读写并同步</p>}
        {!window.desktop && <p className="account-help">浏览器仅在当前标签页会话中保存凭据。WebDAV 需允许此网页跨域访问；桌面版无需设置跨域。</p>}
      </form>}
      {error && <p className="field-error" role="alert">{error}</p>}
    </div>
    {leave && <Confirm title="切换到本地模式？" description="账号的离线修改和连接配置会保留。之后可从已保存的账号继续同步。" action="切换到本地模式" onClose={() => setLeave(false)} onConfirm={() => { setLeave(false); void run(controller.logout); }} />}
    {forget && <Confirm title="移除保存的账号？" description={`移除「${forget.user.name}」的连接和凭据。本机缓存与云端数据保留，重新连接后可以继续使用。`} action="移除账号" onClose={() => setForget(null)} onConfirm={() => { const target = forget; setForget(null); void run(() => controller.forgetAccount(target)); }} />}
  </section>;
}
