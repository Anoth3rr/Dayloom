import { Archive, CalendarDays, CalendarRange, Check, CheckCheck, ChevronRight, CloudOff, Gamepad2, Hash, Inbox, ListChecks, MoreHorizontal, Plus, Search, Settings2, Sun } from 'lucide-react';
import { currentOccurrences } from '../gaming';
import type { AppData, TaskList, View } from '../types';
import { tasksForView } from '../domain';
import { accentStyle, IconButton } from './ui';

export function Sidebar({ data, view, onView, onSearch, onSettings, onList, status }: { data: AppData; view: View; onView: (view: View) => void; onSearch: () => void; onSettings: () => void; onList: (list?: TaskList) => void; status: string }) {
  const items = [
    { id: 'inbox', label: '收集箱', icon: Inbox },
    { id: 'today', label: '今天', icon: Sun },
    { id: 'week', label: '最近 7 天', icon: CalendarRange },
    { id: 'calendar', label: '日历', icon: CalendarDays },
    { id: 'games', label: '游戏日程', icon: Gamepad2 },
    { id: 'all', label: '全部任务', icon: ListChecks },
  ] as const;
  return <aside className="sidebar">
    <div className="brand"><div className="brand-mark"><Check size={22} strokeWidth={3} /><i /></div><div><strong>拾序</strong><span>SHIXU</span></div></div>
    <button className="search-trigger" onClick={onSearch}><Search size={16} /><span>搜索任务</span><kbd>Ctrl K</kbd></button>
    <nav className="main-nav" aria-label="智能清单">
      {items.map(({ id, label, icon: Icon }) => {
        const count = id === 'calendar' ? 0 : id === 'games' ? currentOccurrences(data).filter(item => item.count < item.activity.target).length : tasksForView(data, id).filter(task => !task.completed).length;
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
      <div className="local-note"><div className="local-note-icon"><Archive size={17} /></div><div><strong>每一小步，都算数</strong><span>按自己的节奏，慢慢来。</span></div></div>
      <div className="sidebar-footer"><button className="profile-button" onClick={onSettings} title="偏好设置"><span className="avatar">序</span><span>我的空间<small><i className={status === '保存失败' ? 'error-dot' : ''} />{status}</small></span></button><IconButton label="设置" onClick={onSettings}><Settings2 size={18} /></IconButton></div>
      <div className="local-caption"><CloudOff size={11} />本地生活，安心记录</div>
    </div>
  </aside>;
}
