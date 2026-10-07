import { CalendarDays, CalendarRange, Check, CheckCheck, ChevronRight, Cloud, CloudOff, Repeat2, Hash, Inbox, ListChecks, MoreHorizontal, Plus, Search, Settings2, Sun } from 'lucide-react';
import { currentOccurrences, todayRoutines } from '../gaming';
import type { AppData, TaskList, View } from '../types';
import { tasksForView } from '../domain';
import { accentStyle, IconButton } from './ui';
import type { WorkspaceState } from '../account-types';
import { syncLabels } from './AccountPanel';

export function Sidebar({ data, view, onView, onSearch, onSettings, onList, status, account }: { data: AppData; view: View; onView: (view: View) => void; onSearch: () => void; onSettings: () => void; onList: (list?: TaskList) => void; status: string; account: WorkspaceState }) {
  const items = [
    { id: 'inbox', label: '收集箱', icon: Inbox },
    { id: 'today', label: '今天', icon: Sun },
    { id: 'week', label: '最近 7 天', icon: CalendarRange },
    { id: 'calendar', label: '日历', icon: CalendarDays },
    { id: 'games', label: '周期事务', icon: Repeat2 },
    { id: 'all', label: '全部任务', icon: ListChecks },
  ] as const;
  return <aside className="sidebar">
    <div className="brand"><div className="brand-mark"><Check size={22} strokeWidth={3} /><i /></div><div><strong>拾序</strong><span>SHIXU</span></div></div>
    <button className="search-trigger" onClick={onSearch}><Search size={16} /><span>搜索任务</span><kbd>Ctrl K</kbd></button>
    <nav className="main-nav" aria-label="智能清单">
      {items.map(({ id, label, icon: Icon }) => {
        const count = id === 'calendar' ? 0 : id === 'games' ? currentOccurrences(data).filter(item => item.count < item.activity.target).length : tasksForView(data, id).filter(task => !task.completed).length + (id === 'today' ? todayRoutines(data).filter(item => item.count < item.activity.target).length : 0);
        return <button aria-label={label} aria-current={view === id ? 'page' : undefined} className={`nav-item ${view === id ? 'active' : ''}`} key={id} onClick={() => onView(id)}><Icon size={18} strokeWidth={1.8} /><span>{label}</span>{count > 0 && <span className="nav-count">{count}</span>}</button>;
      })}
    </nav>
    <div className="sidebar-section-heading"><span><ChevronRight size={12} className="rotate-90" />我的清单</span><IconButton label="新建清单" onClick={() => onList()}><Plus size={15} /></IconButton></div>
    <nav className="custom-lists" aria-label="我的清单">
      {data.lists.filter(list => list.id !== 'inbox').map(list => <div key={list.id} className={`list-nav-wrap ${view === `list:${list.id}` ? 'selected' : ''}`} style={accentStyle(list.color)}>
        <button className="nav-item" aria-label={list.name} aria-current={view === `list:${list.id}` ? 'page' : undefined} onClick={() => onView(`list:${list.id}`)}><Hash size={18} className="list-icon" strokeWidth={1.8} /><span>{list.name}</span><span className="nav-count">{data.tasks.filter(task => !task.completed && task.listId === list.id).length || ''}</span></button>
        <IconButton label={`编辑清单 ${list.name}`} className="list-edit" onClick={() => onList(list)}><MoreHorizontal size={16} /></IconButton>
      </div>)}
    </nav>
    <div className="sidebar-divider" />
    <button className={`nav-item completed-nav ${view === 'completed' ? 'active' : ''}`} onClick={() => onView('completed')}><CheckCheck size={18} strokeWidth={1.8} /><span>已完成</span></button>
    <div className="sidebar-bottom">
      <div className="sidebar-footer"><button className="profile-button" onClick={onSettings} title="账号与设置"><span className="avatar">{account.session?.user.name.slice(0, 1) || '序'}</span><span>{account.session?.user.name || '登录账号'}<small><i className={status === '保存失败' ? 'error-dot' : ''} />{status === '保存失败' ? status : account.session ? syncLabels[account.syncStatus] : status}</small></span></button><IconButton label="设置" onClick={onSettings}><Settings2 size={18} /></IconButton></div>
      <div className="local-caption">{account.session ? <><Cloud size={11} />账号同步</> : <><CloudOff size={11} />本地模式</>}</div>
    </div>
  </aside>;
}
