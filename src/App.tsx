import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronRight, Maximize2, Minus, PanelRightClose, PanelRightOpen, Square, X } from 'lucide-react';
import { createTask, dateKey, deleteList, moveTaskTo, validateData } from './domain';
import type { AppData, Task, TaskList, View } from './types';
import { loadData, saveData } from './storage';
import { Sidebar } from './components/Sidebar';
import { TaskView } from './components/Tasks';
import { Agenda } from './components/Agenda';
import { Calendar } from './components/Calendar';
import { ListEditor, TaskEditor } from './components/Editors';
import { Settings } from './components/Settings';
import { IconButton } from './components/ui';

interface Toast { id: number; message: string; action?: () => void; label?: string }
export default function App() {
  const [data, setData] = useState<AppData | null>(null);
  const [loadError, setLoadError] = useState('');
  const [path, setPath] = useState('');
  const [view, setView] = useState<View>('today');
  const [query, setQuery] = useState('');
  const [editor, setEditor] = useState<{ task: Task; isNew: boolean } | null>(null);
  const [listEditor, setListEditor] = useState<{ list?: TaskList } | null>(null);
  const [settings, setSettings] = useState(false);
  const [showAgenda, setShowAgenda] = useState(true);
  const [immersive, setImmersive] = useState(false);
  const [status, setStatus] = useState('正在读取');
  const [toast, setToast] = useState<Toast | null>(null);
  const [today, setToday] = useState(dateKey());
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const generation = useRef(0);
  const dataRef = useRef<AppData | null>(null); dataRef.current = data;
  const notify = useCallback((message: string, action?: () => void, label?: string) => setToast({ id: Date.now(), message, action, label }), []);
  useEffect(() => {
    let active = true;
    loadData().then(loaded => { if (active) { setData(loaded.data); setPath(loaded.path); if (loaded.warning) notify(loaded.warning); } }).catch(error => { if (active) setLoadError(String(error.message || error)); });
    return () => { active = false; };
  }, [notify]);
  useEffect(() => {
    if (!data) return;
    const id = ++generation.current; setStatus('正在保存');
    queue.current = queue.current.catch(() => {}).then(() => saveData(data)).then(() => { if (id === generation.current) setStatus('已保存到本地'); }).catch(error => { setStatus('保存失败'); notify(`保存失败，请导出备份：${error.message || error}`); });
  }, [data, notify]);
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (dataRef.current && window.desktop) {
        const result = window.desktop.flush(dataRef.current);
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
    const timer = setInterval(() => setToday(dateKey()), 30000); return () => clearInterval(timer);
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
    const current = dataRef.current; if (!current) return false;
    try { const next = validateData(fn(current)); dataRef.current = next; setData(next); return true; }
    catch (error) { notify(error instanceof Error ? error.message : String(error)); return false; }
  }
  function saveTask(task: Task) {
    if (!update(current => ({ ...current, tasks: current.tasks.some(item => item.id === task.id) ? current.tasks.map(item => item.id === task.id ? task : item) : [...current.tasks, task] }))) return;
    setEditor(null); notify(editor?.isNew ? '新的小事，已记下' : '任务已更新');
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
  if (loadError) return <div className="startup-state"><div className="brand-mark"><Check /></div><h1>暂时无法读取记录</h1><p>{loadError}</p><button className="button primary" onClick={() => location.reload()}>重新读取</button>{window.desktop && <button className="button secondary" onClick={() => window.desktop?.showDataFolder()}>打开数据目录</button>}</div>;
  if (!data) return <div className="startup-state"><div className="brand-mark loading-mark"><Check /></div><p>正在整理你的空间…</p></div>;
  const edit = (task: Task) => setEditor({ task, isNew: false });
  const viewName = ({ today: '今天', inbox: '收集箱', week: '最近 7 天', calendar: '日历', all: '全部任务', completed: '已完成', search: '搜索' } as Record<string, string>)[view] || data.lists.find(list => list.id === view.slice(5))?.name;
  return <div className={`app-backdrop ${window.desktop ? 'native' : 'preview'} ${immersive ? 'immersive' : ''}`} style={{ '--glass-opacity': data.settings.glass / 100 } as React.CSSProperties}>
    <div className="ambient ambient-one" /><div className="ambient ambient-two" /><div className="ambient ambient-three" />
    <div className="app-window"><div className="titlebar"><div className="titlebar-label"><span className="titlebar-symbol">✦</span>把日子过得有序</div><div className="breadcrumbs"><span>我的空间</span><ChevronRight size={11} /><span>{viewName}</span></div><div className="titlebar-actions">{view !== 'calendar' && <IconButton label={showAgenda ? '收起日程侧栏' : '展开日程侧栏'} onClick={() => setShowAgenda(!showAgenda)}>{showAgenda ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}</IconButton>}{window.desktop ? <div className="window-controls"><IconButton label="最小化" onClick={() => window.desktop?.window('minimize')}><Minus size={14} /></IconButton><IconButton label="最大化或还原" onClick={() => window.desktop?.window('maximize')}><Square size={11} /></IconButton><IconButton label="关闭应用" className="window-close" onClick={() => window.desktop?.window('close')}><X size={16} /></IconButton></div> : <IconButton label="切换沉浸预览" onClick={() => setImmersive(!immersive)}><Maximize2 size={14} /></IconButton>}</div></div>
      <div className="workspace"><Sidebar data={data} view={view} onView={setView} onSearch={() => setView('search')} onSettings={() => setSettings(true)} onList={list => setListEditor({ list })} status={status} />{view === 'calendar' ? <Calendar data={data} today={today} onNew={openNew} onEdit={edit} onMove={(id, date, time) => { update(current => ({ ...current, tasks: current.tasks.map(task => task.id === id ? moveTaskTo(task, date, time) : task) })); notify('日程已调整'); }} /> : <><TaskView data={data} view={view} query={query} onQuery={setQuery} onAdd={task => { update(current => ({ ...current, tasks: [...current.tasks, task] })); notify('新的小事，已记下'); }} onToggle={toggle} onEdit={edit} onNew={() => openNew()} onCalendar={() => setView('calendar')} today={today} />{showAgenda && <Agenda data={data} today={today} onEdit={edit} onNew={date => openNew(date, '09:00')} onCalendar={() => setView('calendar')} />}</>}</div>
      {editor && <TaskEditor key={editor.task.id} task={editor.task} isNew={editor.isNew} data={data} onSave={saveTask} onDelete={remove} onClose={() => setEditor(null)} />}
      {listEditor && <ListEditor list={listEditor.list} data={data} onSave={saveList} onDelete={removeList} onClose={() => setListEditor(null)} />}
      {settings && <Settings data={data} path={path} onChange={next => update(() => next)} onClose={() => setSettings(false)} notify={notify} />}
      {toast && <div className="toast" role="status"><span className="toast-check"><Check size={14} /></span><span>{toast.message}</span>{toast.action && <button onClick={toast.action}>{toast.label}</button>}<IconButton label="关闭提示" onClick={() => setToast(null)}><X size={13} /></IconButton></div>}
    </div>
    {!window.desktop && !immersive && <div className="preview-caption"><span>拾序 SHIXU</span><i />让每一天，都有条不紊。</div>}
  </div>;
}
