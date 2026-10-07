import { useEffect, useRef, useState } from 'react';
import { ArrowDownUp, ArrowUp, CalendarDays, Check, ChevronDown, ChevronRight, CircleCheck, Flag, Inbox, ListTodo, Plus, Search, Sun, Star } from 'lucide-react';
import { addDays, createTask, friendlyDate, parseDate, sortTasks, taskOnDay, taskOverdue, tasksForView, windowLabel, WEEKDAYS } from '../domain';
import type { AppData, Priority, Task, View } from '../types';
import { todayRoutines } from '../gaming';
import { accentStyle, CheckButton } from './ui';

export function TaskRow({ task, data, onToggle, onEdit, today }: { task: Task; data: AppData; onToggle: (id: string) => void; onEdit: (task: Task) => void; today: string }) {
  const list = data.lists.find(list => list.id === task.listId)!;
  const overdue = taskOverdue(task, today);
  return <div className={`task-row ${task.completed ? 'is-complete' : ''}`} data-task-id={task.id} draggable={!task.completed} onDragStart={event => { event.dataTransfer.setData('text/shixu-task', task.id); event.dataTransfer.effectAllowed = 'move'; }}>
    <CheckButton checked={task.completed} priority={task.priority} onChange={() => onToggle(task.id)} label={`${task.completed ? '恢复' : '完成'} ${task.title}`} />
    <button className="task-content" onClick={() => onEdit(task)} aria-label={`编辑任务 ${task.title}`}>
      <span className="task-title">{task.title}</span>
      <span className="task-meta"><span className="list-label" style={accentStyle(list.color)}><i />{list.name}</span>{task.priority === 4 && <span className="very-important-label"><Star size={12} fill="currentColor" />非常重要</span>}{task.subtasks.length > 0 && <span><ListTodo size={12} />{task.subtasks.filter(sub => sub.completed).length}/{task.subtasks.length}</span>}{task.notes && <span className="note-indicator" title="有备注"><span className="note-lines" /></span>}</span>
    </button>
    <button className={`task-date ${overdue ? 'overdue' : ''} ${task.timeWindow ? 'window-date' : ''}`} onClick={() => onEdit(task)} aria-label={`调整日期 ${task.title}`}>{task.timeWindow ? <><span>{windowLabel(task)}</span>{task.date ? `已安排 ${friendlyDate(task.date, today)}${task.time ? ` ${task.time}` : ''}` : '待安排'}</> : task.time ? <><span>{task.date !== today ? friendlyDate(task.date, today) : ''}</span>{task.time}</> : task.date && task.date !== today ? friendlyDate(task.date, today) : ''}{overdue && <span>已逾期</span>}</button>
    {task.priority > 0 && <Flag className={`priority-flag p${task.priority}`} size={14} fill="currentColor" aria-label={task.priority === 4 ? '非常重要' : `${['', '低', '中', '高'][task.priority]}优先级`} />}
  </div>;
}

function QuickAdd({ data, view, onAdd, today }: { data: AppData; view: View; onAdd: (task: Task) => void; today: string }) {
  const [title, setTitle] = useState('');
  const defaultDate = view === 'today' || view === 'week' ? today : '';
  const [date, setDate] = useState(defaultDate);
  const [priority, setPriority] = useState<Priority>(0);
  const [listId, setListId] = useState(view.startsWith('list:') ? view.slice(5) : 'inbox');
  useEffect(() => { setDate(view === 'today' || view === 'week' ? today : ''); setListId(view.startsWith('list:') ? view.slice(5) : 'inbox'); }, [view, today]);
  function add() {
    if (!title.trim()) return;
    onAdd(createTask({ title: title.trim(), date: date || null, priority, listId })); setTitle('');
  }
  return <form className={`quick-add ${title ? 'expanded' : ''}`} onSubmit={event => { event.preventDefault(); add(); }}>
    <div className="quick-add-top"><Plus size={20} strokeWidth={1.6} /><input aria-label="快速添加任务" placeholder="添加任务…" maxLength={300} value={title} onChange={event => setTitle(event.target.value)} /><button type="submit" aria-label="添加任务" disabled={!title.trim()}><ArrowUp size={16} /></button></div>
    <div className="quick-options"><label><CalendarDays size={13} /><input aria-label="快速添加日期" type="date" min="1900-01-01" max="2199-12-31" value={date} onChange={event => setDate(event.target.value)} /></label><select aria-label="快速添加清单" value={listId} onChange={event => setListId(event.target.value)}>{data.lists.map(list => <option value={list.id} key={list.id}>{list.name}</option>)}</select><select aria-label="快速添加优先级" value={priority} onChange={event => setPriority(Number(event.target.value) as Priority)}><option value={0}>无优先级</option><option value={1}>低优先级</option><option value={2}>中优先级</option><option value={3}>高优先级</option><option value={4}>非常重要</option></select><span>Enter 创建</span></div>
  </form>;
}

export function TaskView({ data, view, query, onQuery, onAdd, onToggle, onEdit, onNew, onCalendar, today, recurring }: { data: AppData; view: View; query: string; onQuery: (value: string) => void; onAdd: (task: Task) => void; onToggle: (id: string) => void; onEdit: (task: Task) => void; onNew: () => void; onCalendar: () => void; today: string; recurring?: React.ReactNode }) {
  const [sort, setSort] = useState<'date' | 'priority'>('date');
  const [showComplete, setShowComplete] = useState(true);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (view === 'search') searchRef.current?.focus(); }, [view]);
  const tasks = tasksForView(data, view, query, today);
  const pending = sortTasks(tasks.filter(task => !task.completed), sort);
  const done = tasks.filter(task => task.completed);
  const titles: Record<string, string> = { today: '今天', week: '最近 7 天', inbox: '收集箱', all: '全部任务', completed: '已完成', search: '搜索' };
  const title = titles[view] || data.lists.find(list => list.id === view.slice(5))?.name || '任务';
  const date = parseDate(today);
  const todaysTasks = tasksForView(data, 'today', '', today);
  const routines = todayRoutines(data);
  const todaysDone = todaysTasks.filter(task => task.completed).length + routines.filter(item => item.count >= item.activity.target).length;
  const todayTotal = todaysTasks.length + routines.length;
  const todayPending = todayTotal - todaysDone;
  const percent = todayTotal ? Math.round(todaysDone / todayTotal * 100) : 0;
  const groups: { name: string; tasks: Task[]; overdue?: boolean }[] = [];
  if (view === 'week') {
    for (let i = 0; i < 7; i++) { const day = addDays(today, i); const dayTasks = pending.filter(task => taskOnDay(task, day)); if (dayTasks.length) groups.push({ name: `${friendlyDate(day, today)} · 星期${WEEKDAYS[parseDate(day).getDay()]}`, tasks: dayTasks }); }
  } else if (view === 'today') {
    const overdue = pending.filter(task => taskOverdue(task, today));
    if (overdue.length) groups.push({ name: '稍早的待办', tasks: overdue, overdue: true });
    const rest = pending.filter(task => !taskOverdue(task, today)); if (rest.length) groups.push({ name: '待办任务', tasks: rest });
  } else groups.push({ name: view === 'search' ? '匹配的待办' : '待办任务', tasks: pending });
  const renderGroup = (group: typeof groups[number]) => group.tasks.length > 0 && <section className="task-group" key={group.name}><h3 className={group.overdue ? 'overdue' : ''}><ChevronDown size={14} />{group.name}<span>{group.tasks.length}</span></h3>{group.tasks.map(task => <TaskRow key={task.id} task={task} data={data} today={today} onToggle={onToggle} onEdit={onEdit} />)}</section>;
  return <main className="task-main">
    <header className="page-header"><div><h1>{title}{view === 'today' && <Sun size={25} className="heading-sun" strokeWidth={1.6} />}</h1>{view === 'today' && <p>{`${date.getMonth() + 1} 月 ${date.getDate()} 日，星期${WEEKDAYS[date.getDay()]}`}</p>}</div><div className="task-header-actions"><button className="button primary" onClick={onNew}><Plus size={15} />新建任务</button><div className="view-switch" aria-label="视图切换"><button className="selected" title="清单视图" aria-label="清单视图"><ListTodo size={17} /></button><button title="日历视图" aria-label="日历视图" onClick={onCalendar}><CalendarDays size={17} /></button></div></div></header>
    <div className="task-scroll">
      {view === 'today' && <section className="today-overview"><div className="overview-art"><Sun size={28} strokeWidth={1.25} /><i /><b /></div><div className="overview-text"><span>今日事务</span><p><strong>{todayPending}</strong> 项待处理 · {todaysDone} 项已处理</p></div><div className="progress-ring" style={{ '--progress': `${percent}%` } as React.CSSProperties}><div><strong>{percent}<small>%</small></strong><span>今日进度</span></div></div></section>}
      {view === 'search' ? <div className="search-box"><Search size={19} /><input ref={searchRef} aria-label="搜索全部任务" value={query} onChange={event => onQuery(event.target.value)} placeholder="搜索名称、备注或清单…" /><span>{tasks.length} 个结果</span></div> : view !== 'completed' && <QuickAdd data={data} view={view} onAdd={onAdd} today={today} />}
      {view !== 'completed' && <div className="task-toolbar"><span><span className="tiny-dot" />{view === 'search' ? '搜索结果' : view === 'today' ? `${todayPending} 项待处理` : `${pending.length} 个待办`}</span><label><ArrowDownUp size={13} /><select aria-label="任务排序" value={sort} onChange={event => setSort(event.target.value as 'date' | 'priority')}><option value="date">按时间排序</option><option value="priority">按优先级排序</option></select></label></div>}
      {view === 'today' && recurring}
      {view !== 'completed' && groups.map(renderGroup)}
      {(view === 'completed' || done.length > 0) && <section className="task-group completed-group"><button className="group-toggle" onClick={() => setShowComplete(!showComplete)} aria-expanded={showComplete}>{showComplete ? <ChevronDown size={14} /> : <ChevronRight size={14} />}已完成<span>{done.length}</span><Check size={13} /></button>{showComplete && done.map(task => <TaskRow key={task.id} task={task} data={data} today={today} onToggle={onToggle} onEdit={onEdit} />)}</section>}
      {(view === 'today' ? tasks.length === 0 && routines.length === 0 : tasks.length === 0 || (pending.length === 0 && view !== 'completed' && view !== 'search')) && <div className="empty-state">{view === 'search' ? <Search size={34} strokeWidth={1.3} /> : view === 'inbox' ? <Inbox size={36} strokeWidth={1.3} /> : <CircleCheck size={38} strokeWidth={1.2} />}<h3>{view === 'search' ? '没有找到相关任务' : tasks.length ? '全部任务已完成' : '暂无任务'}</h3>{view === 'search' && <p>试试任务名称、备注或清单名称中的其他关键词。</p>}</div>}
    </div>
    <footer className="task-footer"><span><span className="footer-dot" />{view === 'today' ? `${todayPending} 项待处理 · ${todaysDone} 项已处理` : `${pending.length} 个待办${done.length ? ` · ${done.length} 个已完成` : ''}`}</span><span><kbd>Ctrl</kbd> + <kbd>N</kbd> 新建任务</span></footer>
  </main>;
}
