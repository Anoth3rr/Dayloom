import { normalizeData } from './schema.mjs';
import { uuid } from './uuid.mjs';
import { assertGaming } from './gaming-schema.mjs';

export const emptyData = () => ({ version: 1, tasks: [], lists: [{ id: 'inbox', name: '收集箱', color: '#8996aa' }], settings: { theme: 'light', glass: 82 }, gaming: { games: [], activities: [], progress: [] } });
export const canonical = value => JSON.stringify(value, function (_key, item) {
  return item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().filter(key => item[key] !== undefined).map(key => [key, item[key]])) : item;
});
export const equal = (a, b) => canonical(a) === canonical(b);
export function normalizeEndpoint(value) {
  if (typeof value !== 'string' || value.length > 2048) throw new Error('请输入有效的同步服务地址');
  let url;
  try { url = new URL(value); } catch { throw new Error('请输入完整的服务地址，例如 http://192.168.1.10:4318'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname.replace(/\/+$/, '')) throw new Error('服务地址仅包含 http(s)、主机和端口');
  return url.origin;
}
export function assertEnvelope(value) {
  if (!value || value.version !== 1 || !value.sync || !Number.isSafeInteger(value.sync.revision) || value.sync.revision < 0) throw new Error('账号缓存格式不正确');
  normalizeData(value.data); normalizeData(value.sync.base);
  const pending = value.sync.pending;
  if (pending) {
    if (typeof pending.id !== 'string' || !/^[\da-f-]{36}$/i.test(pending.id) || !Number.isSafeInteger(pending.revision) || pending.revision !== value.sync.revision) throw new Error('同步请求记录无效');
    if ((pending.clientId !== undefined || pending.sequence !== undefined) && (typeof pending.clientId !== 'string' || !/^[\da-f-]{36}$/i.test(pending.clientId) || !Number.isSafeInteger(pending.sequence) || pending.sequence < 1)) throw new Error('同步设备记录无效');
    normalizeData(pending.data);
  }
  return value;
}

// Three-way merge keeps independent edits; conflicting values remain recoverable.
export function mergeData(baseValue, localValue, remoteValue, makeId = uuid) {
  const base = normalizeData(baseValue), local = normalizeData(localValue), remote = normalizeData(remoteValue);
  const recovered = [];
  const recoveryKeys = new Set(), conflictingActivities = new Set();
  const now = new Date().toISOString();
  function recover(kind, value) {
    const recoveryKey = canonical([kind, value]);
    if (recoveryKeys.has(recoveryKey)) return;
    recoveryKeys.add(recoveryKey);
    if (kind === 'task') {
      recovered.push({ ...structuredClone(value), id: makeId(), title: `${value.title.slice(0, 285)}（同步冲突副本）`, listId: 'inbox', completed: false, completedAt: null, example: false });
    } else {
      recovered.push({ id: makeId(), title: `同步冲突：${String(value.title || value.name || '周期完成记录').slice(0, 270)}`, listId: 'inbox', completed: false, completedAt: null, createdAt: now, date: null, time: null, duration: 60, priority: 0, reminder: false, subtasks: [], notes: `两台设备同时修改或删除了这条记录，原始内容已保留：\n${JSON.stringify(value, null, 2).slice(0, 9000)}`, syncRecovery: { kind, value: structuredClone(value) } });
    }
  }
  function fields(kind, before, left, right) {
    const values = new Map(Object.entries(right));
    let conflict = false;
    const groups = kind === 'task' ? [['date', 'time', 'duration', 'timeWindow', 'reminder'], ['completed', 'completedAt']]
      : kind === 'activity' ? [['kind', 'weekdays', 'startDate', 'revision', 'timeWindow', 'anytime', 'planTime', 'planWeekday', 'planMonthDay', 'minutes']]
      : kind === 'progress' ? [['plannedAt', 'allDay']] : [];
    const grouped = new Set(groups.flat());
    for (const key of new Set([...Object.keys(before || {}), ...Object.keys(left), ...Object.keys(right)])) if (!grouped.has(key)) groups.push([key]);
    for (const keys of groups) {
      const pick = obj => keys.map(key => obj?.[key]);
      const b = pick(before), l = pick(left), r = pick(right);
      if (equal(l, b)) continue;
      if (kind === 'progress' && keys[0] === 'count') {
        values.set('count', Math.max(0, Math.min(99, (before?.count || 0) + left.count - (before?.count || 0) + right.count - (before?.count || 0))));
      } else if (equal(r, b) || equal(l, r)) {
        for (const key of keys) left[key] === undefined ? values.delete(key) : values.set(key, structuredClone(left[key]));
      } else if (kind === 'task' && keys[0] === 'completed' && left.completed === right.completed) {
        values.set('completedAt', left.completed ? [left.completedAt, right.completedAt].filter(Boolean).sort().at(-1) || now : null);
      } else {
        conflict = true;
        if (kind === 'activity' && keys.includes('revision')) conflictingActivities.add(left.id);
      }
    }
    if (conflict) recover(kind, left);
    return Object.fromEntries(values);
  }
  function collection(kind, before = [], left = [], right = [], keyOf = item => item.id) {
    const b = new Map(before.map(item => [keyOf(item), item]));
    const l = new Map(left.map(item => [keyOf(item), item]));
    const r = new Map(right.map(item => [keyOf(item), item]));
    const result = [];
    for (const key of new Set([...r.keys(), ...l.keys(), ...b.keys()])) {
      const old = b.get(key), mine = l.get(key), theirs = r.get(key);
      if (old && (!mine || !theirs)) {
        const remaining = mine || theirs;
        if (remaining && !equal(remaining, old)) recover(kind, remaining);
        continue;
      }
      if (!mine || !theirs) { if (mine || theirs) result.push(structuredClone(mine || theirs)); continue; }
      result.push(fields(kind, old, mine, theirs));
    }
    return result;
  }
  const mergedActivities = collection('activity', base.gaming?.activities, local.gaming?.activities, remote.gaming?.activities);
  const localProgress = (local.gaming?.progress || []).filter(entry => {
    if (!conflictingActivities.has(entry.activityId) || entry.revision !== local.gaming.activities.find(item => item.id === entry.activityId)?.revision || entry.revision === base.gaming?.activities.find(item => item.id === entry.activityId)?.revision) return true;
    recover('progress', entry); return false;
  });
  const result = {
    version: 1,
    lists: collection('list', base.lists, local.lists, remote.lists),
    tasks: collection('task', base.tasks, local.tasks, remote.tasks),
    settings: fields('settings', base.settings, local.settings, remote.settings),
    gaming: {
      games: collection('group', base.gaming?.games, local.gaming?.games, remote.gaming?.games),
      activities: mergedActivities,
      progress: collection('progress', base.gaming?.progress, localProgress, remote.gaming?.progress, item => JSON.stringify([item.activityId, item.revision, item.periodStart])),
    },
  };
  if (!result.lists.some(list => list.id === 'inbox')) result.lists.unshift(emptyData().lists[0]);
  const groups = new Set(result.gaming.games.map(group => group.id));
  result.gaming.activities = result.gaming.activities.filter(item => {
    if (groups.has(item.gameId)) return true;
    if (!equal(item, base.gaming?.activities.find(old => old.id === item.id))) recover('activity', item);
    return false;
  });
  result.gaming.activities = result.gaming.activities.flatMap(item => {
    const valid = candidate => { if (!candidate) return false; try { assertGaming({ games: result.gaming.games, activities: [candidate], progress: [] }); return true; } catch { return false; } };
    if (valid(item)) return [item];
    const mine = local.gaming?.activities.find(entry => entry.id === item.id), theirs = remote.gaming?.activities.find(entry => entry.id === item.id);
    if (mine) recover('activity', mine);
    if (valid(theirs)) return [theirs];
    if (theirs) recover('activity', theirs);
    return valid(mine) ? [mine] : [];
  });
  const activities = new Map(result.gaming.activities.map(item => [item.id, item]));
  result.gaming.progress = result.gaming.progress.filter(item => activities.has(item.activityId) && item.revision <= activities.get(item.activityId).revision);
  result.tasks.push(...recovered);
  const lists = new Set(result.lists.map(list => list.id));
  result.tasks = result.tasks.map(task => lists.has(task.listId) ? task : { ...task, listId: 'inbox' });
  return { data: normalizeData(result), conflicts: recovered.length };
}
