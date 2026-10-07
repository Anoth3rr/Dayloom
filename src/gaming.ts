import { addDays, clockText, dateKey, minutes, parseDate, uid, WEEKDAYS } from './domain';
import type { AppData, GameActivity, GamePlannerData, GameProfile, GameProgress, Task, TimeWindow } from './types';

export const KIND_NAMES = { material: '材料本', daily: '日常', weekly: '周常', monthly: '月常' } as const;
export type OccurrenceRef = NonNullable<Task['gameOccurrence']>;
export interface GameOccurrence {
  ref: OccurrenceRef; game: GameProfile; activity: GameActivity;
  start: Date; end: Date; plannedAt: Date; allDay: boolean; count: number;
  timeWindow?: { start: Date; end: Date };
}
export const gamingData = (data: AppData): GamePlannerData => data.gaming || { games: [], activities: [], progress: [] };
const sameRef = (a: OccurrenceRef, b: OccurrenceRef) => a.activityId === b.activityId && a.revision === b.revision && a.periodStart === b.periodStart;
export const occurrenceKey = (ref: OccurrenceRef) => JSON.stringify([ref.activityId, ref.revision, ref.periodStart]);
export const localTime = (at: Date) => clockText(at.getHours() * 60 + at.getMinutes());
export function zoneLabel(offset: number): string { return `UTC${offset < 0 ? '−' : '+'}${Math.floor(Math.abs(offset) / 60)}${offset % 60 ? `:${String(Math.abs(offset) % 60).padStart(2, '0')}` : ''}`; }

// A game day begins at the configured reset, in the server's fixed UTC offset.
export function gameDay(game: GameProfile, now = new Date()): string {
  if (game.clock === 'local') return addDays(dateKey(now), minutes(localTime(now)) < minutes(game.resetTime) ? -1 : 0);
  return new Date(now.getTime() + (game.utcOffset - minutes(game.resetTime)) * 60000).toISOString().slice(0, 10);
}
function serverInstant(game: GameProfile, day: string, time: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  if (game.clock === 'local') return new Date(y, m - 1, d, Math.floor(minutes(time) / 60), minutes(time) % 60);
  return new Date(Date.UTC(y, m - 1, d, 0, minutes(time)) - game.utcOffset * 60000);
}
function activityWindow(activity: GameActivity, game: GameProfile, day: string) {
  if (!activity.timeWindow) return undefined;
  const at = (time: string) => serverInstant(game, minutes(time) < minutes(game.resetTime) ? addDays(day, 1) : day, time);
  return { start: at(activity.timeWindow.earliest), end: at(activity.timeWindow.latest) };
}
function fitsActivityWindow(activity: GameActivity, game: GameProfile, at: Date): boolean {
  const window = activityWindow(activity, game, gameDay(game, at));
  return !window || at >= window.start && at.getTime() + Math.min(1440, activity.minutes * activity.target) * 60000 <= window.end.getTime();
}
function resetAt(game: GameProfile, day: string) { return serverInstant(game, day, game.resetTime); }
function monthDate(day: string, offset: number, requestedDay: number): string {
  const [y, m] = day.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1 + offset, 1));
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(last, requestedDay));
  return date.toISOString().slice(0, 10);
}
export function periodFor(activity: GameActivity, game: GameProfile, businessDay: string): { start: string; end: string } | null {
  if (activity.paused) return null;
  let start = businessDay, end = addDays(businessDay, 1);
  if (activity.kind === 'material' && !activity.weekdays.includes(parseDate(businessDay).getDay())) return null;
  if (activity.kind === 'weekly') {
    start = addDays(businessDay, -((parseDate(businessDay).getDay() - game.weekResetDay + 7) % 7));
    end = addDays(start, 7);
  } else if (activity.kind === 'monthly') {
    start = monthDate(businessDay, 0, game.monthResetDay);
    if (start > businessDay) start = monthDate(businessDay, -1, game.monthResetDay);
    end = monthDate(start, 1, game.monthResetDay);
  }
  return end <= activity.startDate ? null : { start, end };
}
function defaultPlan(activity: GameActivity, game: GameProfile, start: string, end: string): Date {
  let day = start;
  if (activity.kind === 'weekly') day = addDays(start, (activity.planWeekday - parseDate(start).getDay() + 7) % 7);
  if (activity.kind === 'monthly') {
    day = monthDate(start, 0, activity.planMonthDay);
    if (day < start) day = monthDate(start, 1, activity.planMonthDay);
  }
  // A newly created weekly/monthly activity still belongs to its current cycle.
  if (day < activity.startDate) day = activity.startDate;
  if (day >= end) day = addDays(end, -1);
  const time = activity.timeWindow?.earliest || (activity.anytime ? '12:00' : activity.planTime);
  if (minutes(time) < minutes(game.resetTime)) day = addDays(day, 1);
  return serverInstant(game, day, time);
}
function occurrence(gaming: GamePlannerData, activity: GameActivity, game: GameProfile, period: { start: string; end: string }, entries?: Map<string, GameProgress>): GameOccurrence {
  const ref = { activityId: activity.id, revision: activity.revision, periodStart: period.start };
  const entry = entries ? entries.get(occurrenceKey(ref)) : gaming.progress.find(item => sameRef(item, ref));
  const start = resetAt(game, period.start), end = resetAt(game, period.end);
  const override = entry?.plannedAt ? new Date(entry.plannedAt) : null;
  const validOverride = !!override && override >= start && override < end && gameDay(game, override) >= activity.startDate && (entry?.allDay || fitsActivityWindow(activity, game, override));
  const plannedAt = validOverride ? override! : defaultPlan(activity, game, period.start, period.end);
  return { ref, activity, game, start, end, plannedAt, allDay: validOverride ? !!entry?.allDay : !!(activity.anytime || activity.timeWindow), timeWindow: activityWindow(activity, game, gameDay(game, plannedAt)), count: Math.min(activity.target, entry?.count || 0) };
}
export function occurrenceTimeLabel(item: GameOccurrence): string {
  if (item.allDay && item.timeWindow) return `${localTime(item.timeWindow.start)} – ${dateKey(item.timeWindow.end) !== dateKey(item.timeWindow.start) ? '次日 ' : ''}${localTime(item.timeWindow.end)} 可安排`;
  return item.allDay ? '待安排' : `${localTime(item.plannedAt)} · ${item.activity.minutes * item.activity.target} 分钟`;
}
export function currentOccurrences(data: AppData, now = new Date()): GameOccurrence[] {
  const gaming = gamingData(data);
  const entries = new Map(gaming.progress.map(entry => [occurrenceKey(entry), entry]));
  return gaming.activities.flatMap(activity => {
    const game = gaming.games.find(item => item.id === activity.gameId);
    if (!game || gameDay(game, now) < activity.startDate) return [];
    const period = periodFor(activity, game, gameDay(game, now));
    return period ? [occurrence(gaming, activity, game, period, entries)] : [];
  });
}
export function todayRoutines(data: AppData, now = new Date()): GameOccurrence[] {
  return currentOccurrences(data, now).filter(item => item.game.category === 'routine' && (['daily', 'material'].includes(item.activity.kind) || dateKey(item.plannedAt) <= dateKey(now)));
}
export function resolveOccurrence(data: AppData, ref: OccurrenceRef): GameOccurrence | null {
  const gaming = gamingData(data), activity = gaming.activities.find(item => item.id === ref.activityId && item.revision === ref.revision);
  const game = activity && gaming.games.find(item => item.id === activity.gameId);
  if (!activity || !game) return null;
  const period = periodFor(activity, game, ref.periodStart);
  return period?.start === ref.periodStart ? occurrence(gaming, activity, game, period) : null;
}
export function occurrencesInRange(data: AppData, firstDay: string, lastDay: string): GameOccurrence[] {
  const gaming = gamingData(data), found = new Map<string, GameOccurrence>();
  const entries = new Map(gaming.progress.map(entry => [occurrenceKey(entry), entry]));
  const visited = new Set<string>();
  // A 26-hour zone difference plus a plan after midnight can span three dates.
  for (const activity of gaming.activities) {
    const game = gaming.games.find(item => item.id === activity.gameId);
    if (!game || activity.paused) continue;
    for (let day = addDays(firstDay, -3); day <= addDays(lastDay, 3); day = addDays(day, 1)) {
      const period = periodFor(activity, game, day);
      if (!period) continue;
      const key = occurrenceKey({ activityId: activity.id, revision: activity.revision, periodStart: period.start });
      if (visited.has(key)) continue;
      visited.add(key);
      const item = occurrence(gaming, activity, game, period, entries);
      const localDay = dateKey(item.plannedAt);
      if (localDay >= firstDay && localDay <= lastDay) found.set(occurrenceKey(item.ref), item);
    }
  }
  return [...found.values()].sort((a, b) => a.plannedAt.getTime() - b.plannedAt.getTime() || a.activity.title.localeCompare(b.activity.title));
}
export function calendarData(data: AppData, firstDay: string, lastDay: string): AppData {
  const gaming = gamingData(data);
  return {
    ...data,
    lists: [...data.lists, ...gaming.games.map(game => ({ id: `game-list:${game.id}`, name: game.name, color: game.color }))],
    tasks: [...data.tasks, ...occurrencesInRange(data, firstDay, lastDay).map(item => ({
      id: `game-occurrence:${occurrenceKey(item.ref)}`, gameOccurrence: item.ref,
      title: `${item.activity.title}${item.activity.target > 1 ? ` · ${item.count}/${item.activity.target}` : ''}`,
      listId: `game-list:${item.game.id}`, completed: item.count >= item.activity.target,
      date: dateKey(item.plannedAt), time: item.allDay ? null : localTime(item.plannedAt),
      ...(item.timeWindow ? { timeWindow: { earliest: { date: dateKey(item.timeWindow.start), time: localTime(item.timeWindow.start) }, latest: { date: dateKey(item.timeWindow.end), time: localTime(item.timeWindow.end) } } as TimeWindow } : {}),
      duration: Math.min(1440, item.activity.minutes * item.activity.target), priority: 0 as const,
      notes: item.activity.notes, subtasks: [], reminder: false,
      createdAt: item.start.toISOString(), completedAt: null,
    }))],
  };
}
function saveProgress(data: AppData, ref: OccurrenceRef, patch: Partial<GameProgress>): AppData {
  const gaming = gamingData(data), previous = gaming.progress.find(item => sameRef(item, ref));
  const entry: GameProgress = { count: 0, ...previous, ...ref, ...patch };
  return { ...data, gaming: { ...gaming, progress: [...gaming.progress.filter(item => !sameRef(item, ref)), entry] } };
}
export function changeProgress(data: AppData, ref: OccurrenceRef, count: number, now = new Date()): AppData {
  const item = resolveOccurrence(data, ref);
  if (!item) throw new Error('活动规则已更新，请重新打开本期活动');
  if (now < item.start || now >= item.end || gameDay(item.game, now) < item.activity.startDate) throw new Error('只能记录当前刷新周期内的完成次数');
  return saveProgress(data, ref, { count: Math.max(0, Math.min(item.activity.target, Math.trunc(count))) });
}
export function planOccurrence(data: AppData, ref: OccurrenceRef, day: string, time: string | null): AppData {
  const item = resolveOccurrence(data, ref);
  if (!item) throw new Error('活动规则已更新，请重新打开本期活动');
  const at = parseDate(day), value = minutes(time || '12:00');
  at.setHours(Math.floor(value / 60), value % 60, 0, 0);
  if (dateKey(at) !== day || (time && localTime(at) !== time)) throw new Error('该时间在本机时区中不存在，请选择其他时间');
  if (at < item.start || at >= item.end || gameDay(item.game, at) < item.activity.startDate) throw new Error('请安排在本期开放时间内；材料本只能安排在该次开放期间');
  if (time && !fitsActivityWindow(item.activity, item.game, at)) throw new Error('具体安排及预计用时必须在本期的时间窗口内');
  return saveProgress(data, ref, { plannedAt: at.toISOString(), allDay: time === null });
}
export function saveActivity(data: AppData, value: GameActivity): AppData {
  const gaming = gamingData(data), old = gaming.activities.find(item => item.id === value.id);
  const changed = !!old && (old.gameId !== value.gameId || old.kind !== value.kind || old.startDate !== value.startDate || [...old.weekdays].sort().join() !== [...value.weekdays].sort().join());
  const activity = { ...value, title: value.title.trim(), revision: old ? old.revision + Number(changed) : 1 };
  return { ...data, gaming: { ...gaming, activities: old ? gaming.activities.map(item => item.id === activity.id ? activity : item) : [...gaming.activities, activity] } };
}
export function saveGame(data: AppData, value: GameProfile): AppData {
  const gaming = gamingData(data), old = gaming.games.find(item => item.id === value.id);
  const changed = old && (old.clock !== value.clock || old.resetTime !== value.resetTime || old.utcOffset !== value.utcOffset || old.weekResetDay !== value.weekResetDay || old.monthResetDay !== value.monthResetDay);
  return { ...data, gaming: { ...gaming, games: old ? gaming.games.map(item => item.id === value.id ? value : item) : [...gaming.games, value], activities: changed ? gaming.activities.map(item => item.gameId === value.id ? { ...item, revision: item.revision + 1 } : item) : gaming.activities } };
}
export function removeActivity(data: AppData, id: string): AppData {
  const gaming = gamingData(data);
  return { ...data, gaming: { ...gaming, activities: gaming.activities.filter(item => item.id !== id), progress: gaming.progress.filter(item => item.activityId !== id) } };
}
export function removeGame(data: AppData, id: string): AppData {
  const gaming = gamingData(data), ids = new Set(gaming.activities.filter(item => item.gameId === id).map(item => item.id));
  return { ...data, gaming: { games: gaming.games.filter(item => item.id !== id), activities: gaming.activities.filter(item => !ids.has(item.id)), progress: gaming.progress.filter(item => !ids.has(item.activityId)) } };
}
export function newGame(category: 'routine' | 'game' = 'game'): GameProfile { return { id: uid(), name: '', color: category === 'routine' ? '#49aa92' : '#a07ad5', category, clock: category === 'routine' ? 'local' : 'fixed', utcOffset: category === 'routine' ? -new Date().getTimezoneOffset() : 480, resetTime: category === 'routine' ? '00:00' : '04:00', weekResetDay: 1, monthResetDay: 1 }; }
export function newActivity(game: GameProfile, now = new Date()): GameActivity {
  return { id: uid(), gameId: game.id, title: '', kind: 'daily', weekdays: [1, 4, 0], target: 1, planTime: '20:00', planWeekday: game.category === 'routine' ? 1 : 6, planMonthDay: 1, minutes: 15, energy: 0, notes: '', paused: false, startDate: gameDay(game, now), revision: 1, ...(game.category === 'routine' ? { anytime: true } : {}) };
}
export function kindName(activity: GameActivity, game: GameProfile): string { return game.category === 'routine' ? ({ material: '指定星期', daily: '每天', weekly: '每周', monthly: '每月' })[activity.kind] : KIND_NAMES[activity.kind]; }
export function ruleLabel(activity: GameActivity, game?: GameProfile): string {
  if (activity.kind === 'material') return `每周${[1, 2, 3, 4, 5, 6, 0].filter(day => activity.weekdays.includes(day)).map(day => WEEKDAYS[day]).join('、')}${game?.category === 'routine' ? '执行' : '开放'}`;
  return ({ daily: '每天', weekly: '每周', monthly: '每月' })[activity.kind] + ` ${activity.target} 次`;
}
export function remainingLabel(end: Date, now: Date): string {
  const mins = Math.ceil((end.getTime() - now.getTime()) / 60000);
  if (mins <= 0) return '本期已结束';
  if (mins >= 1440) return `${Math.floor(mins / 1440)}天 ${Math.floor(mins % 1440 / 60)}小时后刷新`;
  if (mins >= 60) return `${Math.floor(mins / 60)}小时 ${mins % 60}分后刷新`;
  return `${mins}分钟后刷新`;
}
export function addGameExamples(data: AppData, now = new Date()): AppData {
  const game = { ...newGame(), name: '示例 · 星海冒险' }, gaming = gamingData(data);
  const base = newActivity(game, now);
  const activities: GameActivity[] = [
    { ...base, id: uid(), title: '每日委托与派遣', kind: 'daily', planTime: '19:30', minutes: 15 },
    { ...base, id: uid(), title: '角色天赋 · 辉光之境', kind: 'material', weekdays: [1, 4, 0], target: 3, minutes: 5, energy: 20, notes: '示例规则：周一、周四、周日开放。请根据实际游戏修改。' },
    { ...base, id: uid(), title: '武器突破 · 潮汐遗迹', kind: 'material', weekdays: [2, 3, 5, 6, 0], target: 2, planTime: '20:30', minutes: 5, energy: 20, notes: '这是演示用的开放日，不代表任何实际游戏。' },
    { ...base, id: uid(), title: '每周首领挑战', kind: 'weekly', target: 3, planWeekday: 6, planTime: '21:00', minutes: 10, energy: 30 },
    { ...base, id: uid(), title: '月度商店兑换', kind: 'monthly', planMonthDay: 1, planTime: '19:00', minutes: 5 },
  ];
  return { ...data, gaming: { ...gaming, games: [...gaming.games, game], activities: [...gaming.activities, ...activities] } };
}
