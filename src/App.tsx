import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Check, ChevronRight, Maximize2, Minus, PanelRightClose, PanelRightOpen, Square, X } from 'lucide-react';
import { createTask, dateKey, deleteList, moveTaskTo, uid } from './domain';
import type { AppData, Task, TaskList, View } from './types';
import { WorkspaceController } from './workspace';
import { createWorkspaceAdapter } from './account-adapter';
import { mergeData } from '../shared/sync-data.mjs';
import { Sidebar } from './components/Sidebar';
import { TaskView } from './components/Tasks';
import { Agenda } from './components/Agenda';
import { Calendar } from './components/Calendar';
import { ListEditor, TaskEditor } from './components/Editors';
import { Settings } from './components/Settings';
import { IconButton } from './components/ui';
import { GamePlanner, RecurringToday } from './components/GamePlanner';
import { GameDialogs } from './components/GameEditors';
import type { GameDialog } from './components/GameEditors';
import { planOccurrence } from './gaming';

interface Toast { id: number; message: string; action?: () => void; label?: string }
const workspace = new WorkspaceController(createWorkspaceAdapter());
export default function App() {
  const workspaceState = useSyncExternalStore(workspace.subscribe, workspace.getSnapshot);
  const { data, loadError, path, saveStatus: status } = workspaceState;
  const [view, setView] = useState<View>('today');
  const [query, setQuery] = useState('');
  const [editor, setEditor] = useState<{ task: Task; isNew: boolean } | null>(null);
  const [listEditor, setListEditor] = useState<{ list?: TaskList } | null>(null);
  const [settings, setSettings] = useState(false);
  const [gameDialog, setGameDialog] = useState<GameDialog | null>(null);
  const [showAgenda, setShowAgenda] = useState(true);
  const [immersive, setImmersive] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [now, setNow] = useState(() => new Date());
  const today = dateKey(now);
  const dataRef = useRef<AppData | null>(null); dataRef.current = data;
  const notify = useCallback((message: string, action?: () => void, label?: string) => setToast({ id: Date.now(), message, action, label }), []);
  useEffect(() => { void workspace.start(); }, []);
  useEffect(() => { if (workspaceState.notice) notify(workspaceState.notice.message); }, [workspaceState.notice, notify]);
  useEffect(() => {
    const sync = () => { void workspace.syncNow(); };
    window.addEventListener('online', sync); window.addEventListener('focus', sync);
    return () => { window.removeEventListener('online', sync); window.removeEventListener('focus', sync); };
  }, []);
  useEffect(() => { setView('today'); setEditor(null); setListEditor(null); setGameDialog(null); setQuery(''); }, [workspaceState.session?.user.id, workspaceState.session?.endpoint, workspaceState.session?.folder, workspaceState.session?.provider]);
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (dataRef.current) {
        const result = workspace.flush();
        if (result !== true) { event.preventDefault(); event.returnValue = ''; notify(`保存失败：${result}`); }
      }
    };
    window.addEventListener('beforeunload', handler); return () => window.removeEventListener('beforeunload', handler);
  }, [notify]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.action ? 9000 : 5500); return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const tick = () => setNow(previous => Math.floor(previous.getTime() / 60000) === Math.floor(Date.now() / 60000) ? previous : new Date());
    const timer = setInterval(tick, 1000);
    window.addEventListener('focus', tick);
    return () => { clearInterval(timer); window.removeEventListener('focus', tick); };
  }, []);
  useEffect(() => {
    const theme = data?.settings.theme || 'light';
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => { document.documentElement.dataset.theme = theme === 'system' ? media.matches ? 'dark' : 'light' : theme; };
    apply(); window.desktop?.setTheme(theme); media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [data?.settings.theme]);
  const openNew = useCallback((date?: string, time?: string) => {
    setEditor({ task: createTask({ date: date || (view === 'today' || view === 'week' ? today : null), time: time || null, listId: view.startsWith('list:') ? view.slice(5) : 'inbox' }), isNew: true });
  }, [view, today]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || document.querySelector('[role="dialog"]')) return;
      if (event.key.toLowerCase() === 'k') { event.preventDefault(); setView('search'); }
      if (event.key.toLowerCase() === 'n') { event.preventDefault(); openNew(); }
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [openNew]);
  function update(fn: (current: AppData) => AppData) {
    const success = workspace.update(fn); dataRef.current = workspace.getSnapshot().data; return success;
  }
  function saveTask(task: Task) {
    let message = editor?.isNew ? '任务已创建' : '任务已更新';
    if (!update(current => {
      const draft = { ...task, listId: current.lists.some(list => list.id === task.listId) ? task.listId : 'inbox' };
      if (editor && !editor.isNew && current.tasks.some(item => item.id === task.id)) {
        const baseline = { ...current, tasks: current.tasks.map(item => item.id === task.id ? { ...editor.task, listId: current.lists.some(list => list.id === editor.task.listId) ? editor.task.listId : 'inbox' } : item) };
        const local = { ...current, tasks: current.tasks.map(item => item.id === task.id ? draft : item) };
        const merged = mergeData(baseline, local, current);
        if (merged.conflicts) message = '其他设备也修改了任务，编辑内容已保留为冲突副本。';
        return merged.data;
      }
      if (editor && !editor.isNew) { draft.id = uid(); message = '原任务已被删除，编辑内容已另存为新任务。'; }
      return { ...current, tasks: [...current.tasks, draft] };
    })) return;
    setEditor(null); notify(message);
  }
  function toggle(id: string) {
    update(current => ({ ...current, tasks: current.tasks.map(task => task.id === id ? { ...task, completed: !task.completed, completedAt: task.completed ? null : new Date().toISOString(), example: false } : task) }));
  }
  function remove(id: string) {
    const removed = dataRef.current?.tasks.find(task => task.id === id); if (!removed) return;
    update(current => ({ ...current, tasks: current.tasks.filter(task => task.id !== id) })); setEditor(null);
    notify('任务已删除', () => { update(current => ({ ...current, tasks: [...current.tasks.filter(task => task.id !== removed.id), { ...removed, listId: current.lists.some(list => list.id === removed.listId) ? removed.listId : 'inbox' }] })); notify('任务已恢复'); }, '撤销');
  }
  function saveList(list: TaskList) {
    if (!update(current => ({ ...current, lists: current.lists.some(item => item.id === list.id) ? current.lists.map(item => item.id === list.id ? list : item) : [...current.lists, list] }))) return; setListEditor(null); notify('清单已保存');
  }
  function removeList(id: string) {
    update(current => deleteList(current, id)); if (view === `list:${id}`) setView('inbox'); setListEditor(null); notify('清单已删除，其中的任务已移回收集箱');
  }
  if (loadError) return <div className="startup-state"><div className="brand-mark"><Check /></div><h1>暂时无法读取记录</h1><p>{loadError}</p>{workspaceState.session && <button className="button secondary" onClick={() => void workspace.logout()}>退出账号并查看本机任务</button>}<button className="button primary" onClick={() => location.reload()}>重新读取</button>{window.desktop && <button className="button secondary" onClick={() => window.desktop?.showDataFolder()}>打开数据目录</button>}</div>;
  if (!data) return <div className="startup-state"><div className="brand-mark loading-mark"><Check /></div><p>{workspaceState.busy ? '正在切换账号…' : '正在加载…'}</p></div>;
  const edit = (task: Task) => task.gameOccurrence ? setGameDialog({ kind: 'occurrence', ref: task.gameOccurrence }) : setEditor({ task, isNew: false });
  const viewName = ({ today: '今天', inbox: '收集箱', week: '最近 7 天', calendar: '日历', games: '周期事务', all: '全部任务', completed: '已完成', search: '搜索' } as Record<string, string>)[view] || data.lists.find(list => list.id === view.slice(5))?.name;
  return <div className={`app-backdrop ${window.desktop ? 'native' : 'preview'} ${immersive ? 'immersive' : ''}`} style={{ '--glass-opacity': data.settings.glass / 100 } as React.CSSProperties}>
    <div className="ambient ambient-one" /><div className="ambient ambient-two" /><div className="ambient ambient-three" />
    <div className="app-window"><div className="titlebar"><div className="titlebar-label">Dayloom · 拾序</div><div className="breadcrumbs"><span>我的空间</span><ChevronRight size={11} /><span>{viewName}</span></div><div className="titlebar-actions">{view !== 'calendar' && view !== 'games' && <IconButton label={showAgenda ? '收起日程侧栏' : '展开日程侧栏'} onClick={() => setShowAgenda(!showAgenda)}>{showAgenda ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}</IconButton>}{window.desktop ? <div className="window-controls"><IconButton label="最小化" onClick={() => window.desktop?.window('minimize')}><Minus size={14} /></IconButton><IconButton label="最大化或还原" onClick={() => window.desktop?.window('maximize')}><Square size={11} /></IconButton><IconButton label="关闭应用" className="window-close" onClick={() => window.desktop?.window('close')}><X size={16} /></IconButton></div> : <IconButton label="切换沉浸预览" onClick={() => setImmersive(!immersive)}><Maximize2 size={14} /></IconButton>}</div></div>
      <div className="workspace"><Sidebar data={data} view={view} onView={setView} onSearch={() => setView('search')} onSettings={() => setSettings(true)} onList={list => setListEditor({ list })} status={status} account={workspaceState} />{view === 'games' ? <GamePlanner data={data} now={now} update={update} onDialog={setGameDialog} /> : view === 'calendar' ? <Calendar data={data} today={today} onNew={openNew} onEdit={edit} onMove={(task, date, time) => { if (update(current => task.gameOccurrence ? planOccurrence(current, task.gameOccurrence, date, time) : { ...current, tasks: current.tasks.map(item => item.id === task.id ? moveTaskTo(item, date, time) : item) })) notify('日程已调整'); }} /> : <><TaskView data={data} view={view} query={query} onQuery={setQuery} onAdd={task => { update(current => ({ ...current, tasks: [...current.tasks, task] })); notify('任务已创建'); }} onToggle={toggle} recurring={<RecurringToday data={data} now={now} update={update} onDialog={setGameDialog} onManage={() => setView('games')} />} onEdit={edit} onNew={() => openNew()} onCalendar={() => setView('calendar')} today={today} />{showAgenda && <Agenda data={data} today={today} onEdit={edit} onNew={date => openNew(date, '09:00')} onCalendar={() => setView('calendar')} />}</>}</div>
      {gameDialog && <GameDialogs dialog={gameDialog} data={data} now={now} onDialog={setGameDialog} update={update} />}
      {editor && <TaskEditor key={editor.task.id} task={editor.task} isNew={editor.isNew} data={data} onSave={saveTask} onDelete={remove} onClose={() => setEditor(null)} />}
      {listEditor && <ListEditor list={listEditor.list} data={data} onSave={saveList} onDelete={removeList} onClose={() => setListEditor(null)} />}
      {settings && <Settings controller={workspace} workspaceState={workspaceState} data={data} path={path} onChange={next => update(() => next)} onClose={() => setSettings(false)} notify={notify} />}
      {toast && <div className="toast" role="status"><span className="toast-check"><Check size={14} /></span><span>{toast.message}</span>{toast.action && <button onClick={toast.action}>{toast.label}</button>}<IconButton label="关闭提示" onClick={() => setToast(null)}><X size={13} /></IconButton></div>}
    </div>
    {!window.desktop && !immersive && <div className="preview-caption"><span>Dayloom</span><i />网页预览</div>}
  </div>;
}
