import { useState } from 'react';
import { Cloud, CloudCheck, CloudOff, KeyRound, LoaderCircle, LogIn, LogOut, RefreshCw, Server, UserRound } from 'lucide-react';
import type { WorkspaceController } from '../workspace';
import type { WorkspaceState } from '../account-types';
import { Confirm } from './ui';

export const syncLabels = { local: '本地模式', syncing: '正在同步', synced: '已同步', pending: '等待同步', offline: '离线 · 待同步', expired: '需要重新登录', error: '同步未完成' };
export function AccountPanel({ controller, state }: { controller: WorkspaceController; state: WorkspaceState }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [endpoint, setEndpoint] = useState(state.session?.endpoint || (window.desktop ? 'http://127.0.0.1:4318' : location.origin));
  const [username, setUsername] = useState(state.session?.user.username || '');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [mergeGuest, setMergeGuest] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [logoutConfirm, setLogoutConfirm] = useState(false);
  const busy = working || state.busy;
  const loggedIn = !!state.session && state.syncStatus !== 'expired';
  async function run(action: () => Promise<unknown>) {
    setWorking(true); setError('');
    try { await action(); setPassword(''); setRepeat(''); setOldPassword(''); }
    catch (error) { setError((error as Error).message); }
    finally { setWorking(false); }
  }
  return <section className="settings-section account-section" aria-label="账号与同步">
    <h3>账号与同步</h3>
    <div className="account-card">
      <div className="account-heading"><div className="account-avatar"><UserRound size={24} /></div><div><strong>{state.session?.user.name || '登录账号'}</strong><p>{state.session ? `@${state.session.user.username}` : '在不同设备上查看和管理同一份任务'}</p></div>{loggedIn && <span className={`sync-badge ${state.syncStatus}`} role="status">{state.syncStatus === 'syncing' ? <LoaderCircle size={14} className="spinning" /> : state.syncStatus === 'synced' ? <CloudCheck size={14} /> : <CloudOff size={14} />}{syncLabels[state.syncStatus]}</span>}</div>
      {loggedIn ? <>
        <div className="account-server"><Server size={14} /><span title={state.session!.endpoint}>{state.session!.endpoint}</span></div>
        <div className="sync-detail"><span>任务、清单、周期规则和完成记录自动同步</span><small>{state.lastSyncedAt ? `最近同步：${new Date(state.lastSyncedAt).toLocaleString('zh-CN')}` : '尚未完成首次同步'}</small></div>
        {state.syncError && <p className="account-notice" role="status">{state.syncError}</p>}
        <div className="account-actions"><button className="button primary" type="button" disabled={busy || state.syncStatus === 'syncing'} onClick={() => void run(controller.syncNow)}><RefreshCw size={15} />立即同步</button><button className="button secondary" type="button" disabled={busy} onClick={() => { setPasswordOpen(!passwordOpen); setError(''); }}><KeyRound size={15} />修改密码</button><button className="account-logout" type="button" disabled={busy} onClick={() => setLogoutConfirm(true)}><LogOut size={14} />退出</button></div>
        {passwordOpen && <form className="account-form password-form" onSubmit={event => { event.preventDefault(); if (password !== repeat) return setError('两次输入的新密码不一致'); void run(async () => { await controller.changePassword(oldPassword, password); setPasswordOpen(false); }); }}>
          <label className="form-label">当前密码<input aria-label="当前密码" type="password" autoComplete="current-password" maxLength={128} required value={oldPassword} onChange={event => setOldPassword(event.target.value)} /></label>
          <label className="form-label">新密码<input aria-label="新密码" type="password" autoComplete="new-password" minLength={10} maxLength={128} required value={password} onChange={event => setPassword(event.target.value)} /></label>
          <label className="form-label">确认新密码<input aria-label="确认新密码" type="password" autoComplete="new-password" minLength={10} maxLength={128} required value={repeat} onChange={event => setRepeat(event.target.value)} /></label>
          <button className="button primary" disabled={busy}>保存新密码</button>
        </form>}
      </> : <>
        {state.syncStatus === 'expired' && <p className="account-notice">请重新登录以继续同步，本机修改已保留。</p>}
        <div className="account-tabs segmented"><button type="button" aria-pressed={mode === 'login'} className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError(''); }}>登录</button><button type="button" aria-pressed={mode === 'register'} className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); setError(''); }}>注册账号</button></div>
        <form className="account-form" onSubmit={event => { event.preventDefault(); if (mode === 'register' && password !== repeat) return setError('两次输入的密码不一致'); void run(() => controller.login(mode, endpoint, username, password, name, mergeGuest)); }}>
          <label className="form-label">同步服务地址<input aria-label="同步服务地址" type="url" autoComplete="url" placeholder="http://192.168.1.10:4318" required value={endpoint} onChange={event => setEndpoint(event.target.value)} /></label>
          <div className="account-fields"><label className="form-label">用户名<input aria-label="账号用户名" autoComplete="username" pattern="[a-zA-Z0-9_.\-]{3,32}" minLength={3} maxLength={32} placeholder="3–32 位字母、数字或 . _ -" required value={username} onChange={event => setUsername(event.target.value)} /></label>{mode === 'register' && <label className="form-label">昵称<input aria-label="账号昵称" autoComplete="nickname" maxLength={40} placeholder="在应用中显示的名字" value={name} onChange={event => setName(event.target.value)} /></label>}</div>
          <div className="account-fields"><label className="form-label">密码<input aria-label="账号密码" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={10} maxLength={128} placeholder="至少 10 个字符" required value={password} onChange={event => setPassword(event.target.value)} /></label>{mode === 'register' && <label className="form-label">确认密码<input aria-label="确认密码" type="password" autoComplete="new-password" minLength={10} maxLength={128} required value={repeat} onChange={event => setRepeat(event.target.value)} /></label>}</div>
          {!state.session && <label className="account-import"><input aria-label="合并本机任务" type="checkbox" checked={mergeGuest} onChange={event => setMergeGuest(event.target.checked)} />将本机任务合并到账号<span>保留本机原数据，未修改的示例不导入</span></label>}
          <button className="button primary account-submit" disabled={busy} type="submit">{busy ? <LoaderCircle size={16} className="spinning" /> : mode === 'login' ? <LogIn size={16} /> : <Cloud size={16} />}{busy ? '正在连接…' : mode === 'login' ? '登录并同步' : '创建账号并同步'}</button>
        </form>
      </>}
      {error && <p className="field-error" role="alert">{error}</p>}
    </div>
    {logoutConfirm && <Confirm title="退出当前账号？" description={`${state.syncStatus !== 'synced' ? '尚未同步的修改会保留在此账号的本机缓存中，下次登录继续同步。' : '账号数据已同步，本机缓存会保留。'}退出后显示未登录时的本机任务。`} action="退出账号" onClose={() => setLogoutConfirm(false)} onConfirm={() => { setLogoutConfirm(false); void run(controller.logout); }} />}
  </section>;
}
