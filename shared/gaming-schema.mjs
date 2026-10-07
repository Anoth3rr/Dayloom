import { isValidDate } from './schema.mjs';

export function assertGaming(value) {
  const fail = (reason) => { throw new Error(`周期事务格式不正确：${reason}`); };
  const obj = v => !!v && typeof v === 'object' && !Array.isArray(v);
  const str = (v, max, empty = false) => typeof v === 'string' && v.length <= max && (empty || !!v.trim());
  const int = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
  const time = v => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
  if (!obj(value) || !Array.isArray(value.games) || !Array.isArray(value.activities) || !Array.isArray(value.progress)) fail('缺少游戏、活动或完成记录');
  if (value.games.length > 50 || value.activities.length > 500 || value.progress.length > 50000) fail('记录数量超出上限');
  const games = new Set(), activities = new Map(), progressKeys = new Set();
  for (const game of value.games) {
    if (!obj(game) || !str(game.id, 100) || !str(game.name, 40) || !/^#[\da-f]{6}$/i.test(game.color) || games.has(game.id)) fail('游戏名称、颜色或 ID 无效');
    if (!int(game.utcOffset, -720, 840) || game.utcOffset % 15 || !time(game.resetTime) || !int(game.weekResetDay, 0, 6) || !int(game.monthResetDay, 1, 31)) fail('刷新时间或时区无效');
    if (game.category !== undefined && !['routine', 'game'].includes(game.category)) fail('分组类别无效');
    if (game.clock !== undefined && !['local', 'fixed'].includes(game.clock)) fail('时钟模式无效');
    games.add(game.id);
  }
  for (const activity of value.activities) {
    if (!obj(activity) || !str(activity.id, 100) || activities.has(activity.id) || !games.has(activity.gameId) || !str(activity.title, 150)) fail('活动名称或所属游戏无效');
    if (!['daily', 'material', 'weekly', 'monthly'].includes(activity.kind) || !Array.isArray(activity.weekdays) || activity.weekdays.some(d => !int(d, 0, 6)) || new Set(activity.weekdays).size !== activity.weekdays.length || (activity.kind === 'material' && !activity.weekdays.length)) fail('开放规则无效');
    if (!int(activity.target, 1, 99) || !time(activity.planTime) || !int(activity.planWeekday, 0, 6) || !int(activity.planMonthDay, 1, 31) || !int(activity.minutes, 1, 720) || !int(activity.energy, 0, 999)) fail('次数或计划时间无效');
    if (!str(activity.notes, 5000, true) || typeof activity.paused !== 'boolean' || !isValidDate(activity.startDate) || !int(activity.revision, 1, 100000)) fail('备注、开始日期或规则版本无效');
    if (activity.anytime !== undefined && typeof activity.anytime !== 'boolean') fail('不限时间选项无效');
    if (activity.timeWindow !== undefined) {
      const window = activity.timeWindow;
      if (!obj(window) || !time(window.earliest) || !time(window.latest) || activity.anytime) fail('周期时间窗口无效');
      const game = value.games.find(game => game.id === activity.gameId);
      const min = v => Number(v.slice(0, 2)) * 60 + Number(v.slice(3));
      const offset = v => (min(v) - min(game.resetTime) + 1440) % 1440;
      if (offset(window.latest) < offset(window.earliest)) fail('最晚时间须晚于最早时间，以分组刷新时刻为界');
    }
    activities.set(activity.id, activity);
  }
  for (const entry of value.progress) {
    const activity = obj(entry) && activities.get(entry.activityId);
    if (!activity || !int(entry.revision, 1, activity.revision) || !isValidDate(entry.periodStart) || !int(entry.count, 0, 99)) fail('完成记录无效');
    const key = JSON.stringify([entry.activityId, entry.revision, entry.periodStart]);
    if (progressKeys.has(key)) fail('周期记录重复');
    progressKeys.add(key);
    if (entry.plannedAt !== undefined && (typeof entry.plannedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(entry.plannedAt) || !isValidDate(entry.plannedAt.slice(0, 10)) || !Number.isFinite(Date.parse(entry.plannedAt)) || new Date(entry.plannedAt).toISOString() !== entry.plannedAt)) fail('计划时间无效');
    if (entry.allDay !== undefined && (typeof entry.allDay !== 'boolean' || !entry.plannedAt)) fail('全天计划缺少日期');
  }
  return value;
}
