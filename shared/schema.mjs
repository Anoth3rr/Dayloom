import { assertGaming } from './gaming-schema.mjs';
import { boundaryStamp, windowContains } from './scheduling.mjs';

export function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  if (y < 1900 || y > 2199) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export function assertData(data) {
  const fail = (message) => { throw new Error(`备份格式不正确：${message}`); };
  const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const str = (v, max, empty = false) => typeof v === 'string' && v.length <= max && (empty || v.trim().length > 0);
  const stamp = (v) => typeof v === 'string' && Number.isFinite(Date.parse(v));
  if (!object(data) || data.version !== 1) fail('不支持的数据版本');
  if (!Array.isArray(data.lists) || !data.lists.length || data.lists.length > 100) fail('清单数量无效');
  const lists = new Set();
  for (const list of data.lists) {
    if (!object(list) || !str(list.id, 100) || !str(list.name, 40) || !/^#[a-f\d]{6}$/i.test(list.color)) fail('清单字段无效');
    if (lists.has(list.id)) fail('清单 ID 重复');
    lists.add(list.id);
  }
  if (!lists.has('inbox')) fail('缺少收集箱');
  if (!Array.isArray(data.tasks) || data.tasks.length > 10000) fail('任务数量无效');
  const ids = new Set();
  for (const task of data.tasks) {
    if (task?.gameOccurrence !== undefined) fail('周期活动不能作为普通任务写入');
    if (!object(task) || !str(task.id, 100) || !str(task.title, 300) || !lists.has(task.listId)) fail('任务名称或所属清单无效');
    if (ids.has(task.id)) fail('任务 ID 重复');
    ids.add(task.id);
    if (typeof task.completed !== 'boolean' || typeof task.reminder !== 'boolean') fail('任务状态无效');
    if (task.date !== null && !isValidDate(task.date)) fail('日期无效');
    if (task.time !== null && (typeof task.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(task.time) || !task.date)) fail('时间无效');
    if (task.reminder && (!task.date || !task.time)) fail('提醒缺少日期或时间');
    if (!Number.isInteger(task.duration) || task.duration < 5 || task.duration > 1440) fail('时长必须为 5–1440 分钟');
    if (task.timeWindow !== undefined) {
      const window = task.timeWindow;
      const validBoundary = b => b === null || (object(b) && isValidDate(b.date) && (b.time === null || (typeof b.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(b.time))));
      if (!object(window) || !validBoundary(window.earliest) || !validBoundary(window.latest) || (!window.earliest && !window.latest)) fail('时间窗口至少需要一个有效边界');
      if (boundaryStamp(window.earliest) > boundaryStamp(window.latest, true)) fail('最晚完成时间不能早于最早开始时间');
      if (task.date && !windowContains(window, task.date, task.time, task.time ? task.duration : 0)) fail('具体安排必须在任务时间窗口内');
    }
    if (task.longTerm !== undefined) {
      if (!object(task.longTerm) || !isValidDate(task.longTerm.startDate) || !Array.isArray(task.longTerm.doneDates) || task.longTerm.doneDates.length > 100000 || task.longTerm.doneDates.some(day => !isValidDate(day)) || new Set(task.longTerm.doneDates).size !== task.longTerm.doneDates.length) fail('长期事务的每日推进记录无效');
    }
    if (![0, 1, 2, 3, 4].includes(task.priority) || !str(task.notes, 10000, true)) fail('优先级或备注无效');
    if (!stamp(task.createdAt) || (task.completedAt !== null && !stamp(task.completedAt))) fail('创建或完成时间无效');
    if (task.example !== undefined && typeof task.example !== 'boolean') fail('示例标记无效');
    if (!Array.isArray(task.subtasks) || task.subtasks.length > 100) fail('子任务数量无效');
    const subIds = new Set();
    for (const sub of task.subtasks) {
      if (!object(sub) || !str(sub.id, 100) || !str(sub.title, 300) || typeof sub.completed !== 'boolean' || subIds.has(sub.id)) fail('子任务字段无效');
      subIds.add(sub.id);
    }
  }
  if (!object(data.settings) || !['light', 'dark', 'system'].includes(data.settings.theme) || !Number.isFinite(data.settings.glass) || data.settings.glass < 55 || data.settings.glass > 100) fail('外观设置无效');
  if (data.gaming !== undefined) assertGaming(data.gaming);
  return data;
}

export function normalizeData(value) {
  const data = assertData(value);
  if (!data.tasks.some(task => task.longTerm !== undefined)) return data;
  return { ...data, tasks: data.tasks.map(task => {
    if (task.longTerm === undefined) return task;
    const { longTerm, ...rest } = task;
    return { ...rest, priority: 4, legacyLongTerm: longTerm };
  }) };
}
