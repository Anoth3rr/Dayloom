import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Plus } from 'lucide-react';
import { addDays, dayEvents, friendlyDate, monthDays, monthTitle, parseDate, shiftMonth, taskOnDay, timeRange, WEEKDAYS } from '../domain';
import { calendarData } from '../gaming';
import type { AppData, Task } from '../types';
import { accentStyle, IconButton } from './ui';
import { useState } from 'react';

export function MiniCalendar({ data, selected, onSelect, today, month, setMonth }: { data: AppData; selected: string; onSelect: (date: string) => void; today: string; month: string; setMonth: (date: string) => void }) {
  return <div className="mini-calendar"><div className="mini-month-title"><strong>{monthTitle(month)}</strong><div><IconButton label="上个月" onClick={() => setMonth(shiftMonth(month, -1))}><ChevronLeft size={15} /></IconButton><IconButton label="下个月" onClick={() => setMonth(shiftMonth(month, 1))}><ChevronRight size={15} /></IconButton></div></div><div className="mini-weekdays">{['一', '二', '三', '四', '五', '六', '日'].map(day => <span key={day}>{day}</span>)}</div><div className="mini-days">{monthDays(month).map(day => <button key={day} aria-label={`选择日期 ${day}`} aria-pressed={day === selected} className={`${day.slice(0, 7) !== month.slice(0, 7) ? 'muted' : ''} ${day === today ? 'is-today' : ''} ${day === selected ? 'selected' : ''}`} onClick={() => { onSelect(day); if (day.slice(0, 7) !== month.slice(0, 7)) setMonth(day); }}><span>{parseDate(day).getDate()}</span>{data.tasks.some(task => taskOnDay(task, day) && !task.completed) && <i />}</button>)}</div></div>;
}
export function Agenda({ data: storedData, today, onEdit, onNew, onCalendar }: { data: AppData; today: string; onEdit: (task: Task) => void; onNew: (date: string) => void; onCalendar: () => void }) {
  const [selected, setSelected] = useState(today);
  const [month, setMonth] = useState(today);
  const days = monthDays(month);
  const data = calendarData(storedData, addDays(days[0] < selected ? days[0] : selected, -1), days[41] > selected ? days[41] : selected);
  const events = dayEvents(data.tasks.filter(task => !task.completed), selected);
  const allDay = data.tasks.filter(task => !task.completed && taskOnDay(task, selected) && !task.time);
  return <aside className="agenda-panel"><header className="agenda-heading"><span><CalendarDays size={17} />日程一览</span><IconButton label="打开完整日历" onClick={onCalendar}><ChevronRight size={17} /></IconButton></header><MiniCalendar key={today} data={data} today={today} selected={selected} onSelect={setSelected} month={month} setMonth={setMonth} /><div className="agenda-divider" /><div className="agenda-date"><div><strong>{friendlyDate(selected, today)}</strong><span>星期{WEEKDAYS[parseDate(selected).getDay()]}</span></div><button onClick={() => { setSelected(today); setMonth(today); }} className="text-button">回到今天</button></div><div className="agenda-summary"><Clock3 size={12} />{events.length} 段日程 · {allDay.length} 个待安排</div><div className="agenda-scroll">
    {allDay.length > 0 && <div className="all-day-summary"><span>全天 / 待安排</span>{allDay.map(task => { const list = data.lists.find(list => list.id === task.listId)!; return <button key={task.id} style={accentStyle(list.color)} onClick={() => onEdit(task)}><i /><span>{task.title}{task.timeWindow && <small>{timeRange(task)}</small>}</span></button>; })}</div>}
    <div className="agenda-timeline">{events.map(({ task, continuation }) => { const list = data.lists.find(list => list.id === task.listId)!; return <div className="agenda-entry" key={`${task.id}-${continuation}`} style={accentStyle(list.color)}><div className="agenda-time"><i />{continuation ? '00:00' : task.time}</div><button className="agenda-event" onClick={() => onEdit(task)}><strong>{task.title}</strong><span>{continuation ? '接续昨日 · ' : ''}{timeRange(task)}</span><small><i />{list.name}</small></button></div>; })}</div>
    {!events.length && !allDay.length && <div className="agenda-empty"><SunIllustration /><strong>当天暂无日程</strong></div>}
    <button className="add-schedule" onClick={() => onNew(selected)}><Plus size={15} />安排日程</button>
  </div></aside>;
}
function SunIllustration() { return <svg width="94" height="74" viewBox="0 0 94 74" fill="none" aria-hidden="true"><circle cx="48" cy="33" r="19" fill="currentColor" opacity=".07" /><circle cx="48" cy="33" r="12" stroke="currentColor" strokeWidth="1.5" opacity=".6" /><path d="M48 9v-4m0 52v4M24 33h-4m52 0h4M31 16l-3-3m37 3 3-3M31 50l-3 3m37-3 3 3M17 65h60" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity=".4" /></svg>; }
