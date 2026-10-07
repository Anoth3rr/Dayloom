import { assertData } from '../shared/schema.mjs';
import { boundaryStamp, windowContains } from '../shared/scheduling.mjs';
import type { AppData, Task, View } from './types';

export const COLORS = ['#5a80ed', '#49aa92', '#a07ad5', '#dc9a50', '#df7f98', '#7592a7'];
export const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
export const uid = () => crypto.randomUUID();
export function dateKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function parseDate(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}
export function addDays(key: string, amount: number): string {
  const date = parseDate(key); date.setDate(date.getDate() + amount); return dateKey(date);
}
export function startOfWeek(key: string): string {
  return addDays(key, -((parseDate(key).getDay() + 6) % 7));
}
export function monthDays(key: string): string[] {
  const date = parseDate(key); date.setDate(1);
  const start = startOfWeek(dateKey(date));
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}
export function shiftMonth(key: string, count: number): string {
  const date = parseDate(key); date.setDate(1); date.setMonth(date.getMonth() + count); return dateKey(date);
}
export function monthTitle(key: string): string {
  const date = parseDate(key); return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月`;
}
export function friendlyDate(key: string | null, today = dateKey()): string {
  if (!key) return '无日期';
  if (key === today) return '今天';
  if (key === addDays(today, 1)) return '明天';
  if (key === addDays(today, -1)) return '昨天';
  const date = parseDate(key);
  return `${date.getFullYear() !== parseDate(today).getFullYear() ? `${date.getFullYear()}年` : ''}${date.getMonth() + 1}月${date.getDate()}日`;
}
export const minutes = (time: string) => { const [h, m] = time.split(':').map(Number); return h * 60 + m; };
export const clockText = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
export function timeRange(task: Task): string {
  if (!task.time && task.timeWindow) return windowLabel(task);
  if (!task.time) return '全天';
  const end = minutes(task.time) + task.duration;
  return `${task.time} – ${end >= 1440 ? '次日 ' : ''}${clockText(end)}`;
}
export function windowLabel(task: Task): string {
  const window = task.timeWindow;
  if (!window) return '';
  const label = (value: NonNullable<typeof window.earliest>) => `${friendlyDate(value.date)}${value.time ? ` ${value.time}` : ''}`;
  if (!window.earliest) return `${label(window.latest!)}前完成`;
  if (!window.latest) return `${label(window.earliest)}起可安排`;
  if (window.earliest.date === window.latest.date) return `${friendlyDate(window.earliest.date)} ${window.earliest.time || '00:00'} – ${window.latest.time || '24:00'}`;
  return `${label(window.earliest)} – ${label(window.latest)}`;
}
export function taskOnDay(task: Task, day: string): boolean {
  if (task.date) return task.date === day;
  if (!task.timeWindow) return false;
  if (task.completed && task.completedAt && day > dateKey(new Date(task.completedAt))) return false;
  const first = task.timeWindow.earliest?.date || dateKey(new Date(task.createdAt));
  return day >= first && (!task.timeWindow.latest || day <= task.timeWindow.latest.date);
}
export function taskOverdue(task: Task, today = dateKey(), now = new Date()): boolean {
  if (task.completed) return false;
  if (task.timeWindow) return !!task.timeWindow.latest && (task.timeWindow.latest.date < today || dateKey(now) === today && boundaryStamp(task.timeWindow.latest, true) < now.getTime());
  return !!task.date && task.date < today;
}
export function toggleDailyProgress(task: Task, day = dateKey()): Task {
  if (!task.longTerm || task.completed || day < task.longTerm.startDate || !!task.timeWindow?.earliest && day < task.timeWindow.earliest.date) return task;
  const days = task.longTerm.doneDates;
  return { ...task, example: false, longTerm: { ...task.longTerm, doneDates: days.includes(day) ? days.filter(value => value !== day) : [...days, day].sort() } };
}
export function createTask(patch: Partial<Task> = {}): Task {
  return {
    id: uid(), title: '', listId: 'inbox', completed: false, date: null, time: null,
    duration: 60, priority: 0, notes: '', subtasks: [], reminder: false,
    createdAt: new Date().toISOString(), completedAt: null, ...patch,
  };
}
export function seedData(today = dateKey()): AppData {
  const make = (patch: Partial<Task>) => createTask({ date: today, example: true, ...patch });
  return {
    version: 1,
    lists: [
      { id: 'inbox', name: '收集箱', color: '#8996aa' },
      { id: 'work', name: '工作事项', color: COLORS[0] },
      { id: 'life', name: '日常生活', color: COLORS[1] },
      { id: 'learn', name: '学习成长', color: COLORS[2] },
    ],
    settings: { theme: 'light', glass: 82 },
    tasks: [
      make({ title: '梳理新项目的设计方向', listId: 'work', priority: 3, time: '09:30', duration: 90, notes: '收集灵感，整理用户需求，让想法慢慢清晰起来。', subtasks: [{ id: uid(), title: '整理参考与灵感', completed: true }, { id: uid(), title: '明确三个核心场景', completed: false }, { id: uid(), title: '画出第一版页面草图', completed: false }] }),
      make({ title: '和团队一起过一遍方案', listId: 'work', priority: 2, time: '11:00', duration: 45, notes: '带上你的想法，也留一点空间给新的灵感。' }),
      make({ title: '留一段时间，读几页书', listId: 'learn', time: '14:00', duration: 45, notes: '不急着读完，享受专注的片刻。' }),
      make({ title: '补充冰箱里的水果和牛奶', listId: 'life', priority: 0, notes: '苹果、蓝莓、燕麦奶。' }),
      make({ title: '傍晚散步，收集一点好心情', listId: 'life', time: '18:30', duration: 30 }),
      make({ title: '给自己准备一份早餐', listId: 'life', completed: true, completedAt: new Date().toISOString() }),
      make({ title: '整理今天的计划', listId: 'work', completed: true, completedAt: new Date().toISOString() }),
      make({ title: '把偶然想到的点子记下来', listId: 'inbox', date: null, notes: '这里是收集箱。还没想好什么时候做的事，都可以先放在这里。' }),
      make({ title: '整理这周的学习笔记', listId: 'learn', date: addDays(today, 1), time: '10:00', duration: 60, priority: 1 }),
      make({ title: '和朋友喝一杯咖啡', listId: 'life', date: addDays(today, 2), time: '15:00', duration: 90 }),
      make({ title: '完成项目的第一版草图', listId: 'work', date: addDays(today, 1), time: '14:00', duration: 120, priority: 3 }),
    ],
  };
}
export function validateData(value: unknown): AppData { return assertData(value) as AppData; }
export function tasksForView(data: AppData, view: View, query = '', today = dateKey()): Task[] {
  return data.tasks.filter(task => {
    if (view === 'search') {
      const list = data.lists.find(list => list.id === task.listId)?.name || '';
      return `${task.title} ${task.notes} ${list} ${task.subtasks.map(sub => sub.title).join(' ')}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
    }
    if (view === 'important') return !!task.longTerm;
    if (view === 'today') {
      if (task.longTerm) return task.longTerm.startDate <= today && (!task.timeWindow?.earliest || task.timeWindow.earliest.date <= today) && (!task.completed || !!task.completedAt && dateKey(new Date(task.completedAt)) === today);
      return taskOnDay(task, today) || taskOverdue(task, today);
    }
    if (view === 'week') return Array.from({ length: 7 }, (_, i) => addDays(today, i)).some(day => taskOnDay(task, day));
    if (view === 'inbox') return task.listId === 'inbox';
    if (view === 'completed') return task.completed;
    if (view.startsWith('list:')) return task.listId === view.slice(5);
    return true;
  });
}
export function sortTasks(tasks: Task[], sort: 'date' | 'priority'): Task[] {
  const due = (task: Task) => task.timeWindow?.latest?.date || task.date || task.timeWindow?.earliest?.date || '9999';
  return [...tasks].sort((a, b) => (sort === 'priority' ? b.priority - a.priority : 0) || due(a).localeCompare(due(b)) || (a.time || '99').localeCompare(b.time || '99') || b.priority - a.priority || a.createdAt.localeCompare(b.createdAt));
}
export interface EventSegment { task: Task; start: number; end: number; continuation: boolean; lane: number; lanes: number }
export function dayEvents(tasks: Task[], day: string): EventSegment[] {
  const events: EventSegment[] = [];
  for (const task of tasks) {
    if (!task.date || !task.time) continue;
    const start = minutes(task.time);
    if (task.date === day) events.push({ task, start, end: Math.min(1440, start + task.duration), continuation: false, lane: 0, lanes: 1 });
    if (addDays(task.date, 1) === day && start + task.duration > 1440) events.push({ task, start: 0, end: start + task.duration - 1440, continuation: true, lane: 0, lanes: 1 });
  }
  events.sort((a, b) => a.start - b.start || b.end - a.end);
  let group: EventSegment[] = [], groupEnd = -1;
  const finish = () => {
    const ends: number[] = [];
    for (const event of group) {
      let lane = ends.findIndex(end => end <= event.start);
      if (lane === -1) lane = ends.length;
      ends[lane] = event.end; event.lane = lane;
    }
    for (const event of group) event.lanes = ends.length;
  };
  for (const event of events) {
    if (event.start >= groupEnd) { finish(); group = []; groupEnd = -1; }
    group.push(event); groupEnd = Math.max(groupEnd, event.end);
  }
  finish(); return events;
}
export function moveTaskTo(task: Task, date: string, time: string | null): Task {
  if (!windowContains(task.timeWindow, date, time, time ? task.duration : 0)) throw new Error('具体安排必须在最早开始和最晚完成之间；请先调整时间窗口或预计用时');
  return { ...task, date, time, reminder: time ? task.reminder : false, example: false };
}
export { boundaryStamp, windowContains };
export function deleteList(data: AppData, id: string): AppData {
  if (id === 'inbox') return data;
  return { ...data, lists: data.lists.filter(list => list.id !== id), tasks: data.tasks.map(task => task.listId === id ? { ...task, listId: 'inbox', example: false } : task) };
}
