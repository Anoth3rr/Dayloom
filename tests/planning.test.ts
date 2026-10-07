import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTask, dateKey, dayEvents, moveTaskTo, seedData, taskOnDay, taskOverdue, tasksForView, validateData } from '../src/domain';
import { calendarData, changeProgress, currentOccurrences, gameDay, newActivity, newGame, occurrencesInRange, planOccurrence, saveActivity, saveGame } from '../src/gaming';
import type { AppData, GameActivity, Task } from '../src/types';

const today = '2026-10-07';
const now = new Date(2026, 9, 7, 12);
const dataWith = (...tasks: Task[]): AppData => ({ ...seedData(today), tasks });
const windowTask = () => createTask({ title: '准备资料', createdAt: now.toISOString(), timeWindow: { earliest: { date: today, time: '09:00' }, latest: { date: '2026-10-09', time: '18:00' } } });
function routine(patch: Partial<GameActivity> = {}): AppData {
  const game = { ...newGame('routine'), name: '日常生活' };
  return { ...dataWith(), gaming: { games: [game], activities: [{ ...newActivity(game, now), title: '周期测试', startDate: '2026-01-01', ...patch }], progress: [] } };
}

test('只有截止日期、只有最早日期和完整时间窗口均可保存，旧数据不受影响', () => {
  for (const timeWindow of [windowTask().timeWindow!, { earliest: null, latest: { date: '2027-01-01', time: null } }, { earliest: { date: today, time: null }, latest: null }]) {
    const data = dataWith(createTask({ title: '窗口', timeWindow }));
    assert.deepEqual(validateData(JSON.parse(JSON.stringify(data))), data);
  }
  assert.doesNotThrow(() => validateData(seedData()));
});
test('窗口只投影到允许的日期，不自动占用时间轴；没有固定时长要求', () => {
  const task = windowTask();
  assert.equal(taskOnDay(task, '2026-10-06'), false);
  assert.equal(taskOnDay(task, '2026-10-08'), true);
  assert.equal(taskOnDay(task, '2026-10-10'), false);
  assert.equal(dayEvents([task], today).length, 0);
  assert.equal(tasksForView(dataWith(task), 'today', '', today).length, 1);
  assert.equal(tasksForView(dataWith(task), 'week', '', '2026-10-03').length, 1);
  assert.equal(tasksForView(dataWith(task), 'today', '', '2026-10-10').length, 1);
  assert.equal(taskOverdue(task, '2026-10-08'), false);
  assert.equal(taskOverdue(task, '2026-10-10'), true);
});
test('只设截止日期不会投影到创建日期之前，截止时刻到期立即标记', () => {
  const task = createTask({ title: '截止日期', createdAt: now.toISOString(), timeWindow: { earliest: null, latest: { date: today, time: '18:00' } } });
  assert.equal(taskOnDay(task, '2026-10-06'), false);
  assert.equal(taskOnDay(task, today), true);
  assert.equal(taskOverdue(task, today, new Date(2026, 9, 7, 17, 59)), false);
  assert.equal(taskOverdue(task, today, new Date(2026, 9, 7, 18, 1)), true);
});
test('日期和时刻边界校验，拖动任务必须让完整执行时间落在窗口中', () => {
  const task = windowTask();
  assert.throws(() => moveTaskTo(task, today, '08:30'), /时间窗口/);
  assert.throws(() => moveTaskTo(task, '2026-10-09', '17:30'), /时间窗口/);
  assert.throws(() => moveTaskTo(task, '2026-10-10', null), /时间窗口/);
  const moved = moveTaskTo(task, today, '09:00');
  assert.equal(dayEvents([moved], today).length, 1);
  assert.equal(taskOnDay(moved, '2026-10-08'), false);
  assert.deepEqual(moved.timeWindow, task.timeWindow);
  assert.doesNotThrow(() => validateData(dataWith(moved)));
  assert.throws(() => validateData(dataWith({ ...task, date: today, time: '08:30' })), /时间窗口/);
  assert.throws(() => validateData(dataWith({ ...task, timeWindow: { earliest: { date: '2026-10-09', time: '18:01' }, latest: { date: '2026-10-09', time: '18:00' } } })), /早于/);
  assert.throws(() => validateData(dataWith({ ...task, timeWindow: { earliest: null, latest: null } })), /至少/);
});
test('跨日窗口可安排夜间事务，日期截止包含整天', () => {
  const task = createTask({ title: '夜间整理', duration: 120, timeWindow: { earliest: { date: today, time: '23:00' }, latest: { date: '2026-10-08', time: '01:00' } } });
  const scheduled = moveTaskTo(task, today, '23:00');
  assert.equal(dayEvents([scheduled], '2026-10-08')[0].end, 60);
  const wholeDay = { ...task, duration: 30, timeWindow: { earliest: null, latest: { date: today, time: null } } };
  assert.doesNotThrow(() => moveTaskTo(wholeDay, today, '23:29'));
  assert.throws(() => moveTaskTo(wholeDay, today, '23:45'), /时间窗口/);
});
test('非常重要在远期日期之前每天显示，完成后次日停止', () => {
  const task = createTask({ title: '准备年度考试', priority: 4, date: '2027-06-01' });
  assert.equal(tasksForView(dataWith(task), 'today', '', today).length, 1);
  assert.equal(tasksForView(dataWith(task), 'today', '', '2026-10-08').length, 1);
  const done = { ...task, completed: true, completedAt: now.toISOString() };
  assert.equal(tasksForView(dataWith(done), 'today', '', today).length, 1);
  assert.equal(tasksForView(dataWith(done), 'today', '', '2026-10-08').length, 0);
  assert.equal(tasksForView(dataWith({ ...task, priority: 3 }), 'today', '', today).length, 0);
});
test('旧长期事务转换为非常重要，推进历史保留；窗口完成后停止投影', () => {
  const task = createTask({ title: '旧长期目标', longTerm: { startDate: today, doneDates: [today] } });
  const migrated = validateData(dataWith(task));
  assert.equal(migrated.tasks[0].priority, 4);
  assert.equal(migrated.tasks[0].longTerm, undefined);
  assert.deepEqual(migrated.tasks[0].legacyLongTerm, task.longTerm);
  assert.throws(() => validateData(dataWith({ ...task, longTerm: { startDate: today, doneDates: [today, today] } })), /每日推进/);
  const windowDone = { ...windowTask(), completed: true, completedAt: now.toISOString() };
  assert.equal(taskOnDay(windowDone, today), true);
  assert.equal(taskOnDay(windowDone, '2026-10-08'), false);
});
test('普通日程本机午夜刷新，周与月进度独立，到新周期自动重置', () => {
  for (const [kind, after] of [['daily', new Date(2026, 9, 8)], ['weekly', new Date(2026, 9, 12)], ['monthly', new Date(2026, 10, 1)]] as const) {
    const data = routine({ kind });
    const item = currentOccurrences(data, now)[0];
    assert.equal(item.allDay, true);
    assert.equal(item.start.getHours(), 0);
    const done = changeProgress(data, item.ref, 1, now);
    assert.equal(currentOccurrences(done, now)[0].count, 1);
    assert.equal(currentOccurrences(done, after)[0].count, 0);
    assert.equal(done.gaming!.progress.length, 1);
    assert.doesNotThrow(() => validateData(done));
  }
  const data = routine({ kind: 'material', weekdays: [1, 3, 5] });
  assert.equal(currentOccurrences(data, now).length, 1);
  assert.equal(currentOccurrences(data, new Date(2026, 9, 8, 12)).length, 0);
});
test('普通时间窗口默认待安排，安排本期后保留窗口与进度，拒绝越界', () => {
  let data = routine({ anytime: false, timeWindow: { earliest: '09:00', latest: '22:00' } });
  const item = currentOccurrences(data, now)[0];
  assert.equal(item.allDay, true);
  assert.equal(item.timeWindow!.start.getHours(), 9);
  assert.equal(calendarData(data, today, today).tasks[0].time, null);
  data = changeProgress(data, item.ref, 1, now);
  assert.throws(() => planOccurrence(data, item.ref, today, '08:00'), /时间窗口/);
  assert.throws(() => planOccurrence(data, item.ref, today, '21:55'), /时间窗口/);
  data = planOccurrence(data, item.ref, today, '21:00');
  assert.equal(currentOccurrences(data, now)[0].count, 1);
  assert.equal(calendarData(data, today, today).tasks[0].time, '21:00');
  data = planOccurrence(data, item.ref, today, null);
  assert.equal(calendarData(data, today, today).tasks[0].time, null);
});
test('旧游戏无类别或时钟字段仍按服务器刷新，窗口编辑保留完成记录', () => {
  const game = { ...newGame(), name: '旧游戏' }; delete game.category; delete game.clock;
  let data = { ...dataWith(), gaming: { games: [game], activities: [{ ...newActivity(game, now), title: '旧材料本' }], progress: [] } } as AppData;
  assert.equal(gameDay(game, new Date('2026-10-07T19:59:59Z')), '2026-10-07');
  const item = currentOccurrences(data, now)[0];
  data = changeProgress(data, item.ref, 1, now);
  data = saveActivity(data, { ...item.activity, timeWindow: { earliest: '22:00', latest: '02:00' } });
  assert.equal(currentOccurrences(data, now)[0].count, 1);
  assert.doesNotThrow(() => validateData(data));
  assert.throws(() => validateData(routine({ anytime: false, timeWindow: { earliest: '22:00', latest: '02:00' } })), /最晚时间/);
  assert.equal(saveGame(data, { ...game, clock: 'local' }).gaming!.activities[0].revision, 2);
});
test('本机时钟跨夏令时仍在本地午夜刷新，不依赖固定 24 小时', () => {
  const original = process.env.TZ;
  try {
    process.env.TZ = 'America/New_York';
    const data = routine({ startDate: '2026-01-01' });
    const day = currentOccurrences(data, new Date(2026, 2, 8, 12))[0];
    assert.equal(day.start.getHours(), 0);
    assert.equal(day.end.getHours(), 0);
    assert.equal(day.end.getTime() - day.start.getTime(), 23 * 3600000);
    const plans = occurrencesInRange(data, '2026-03-07', '2026-03-09');
    assert.deepEqual(plans.map(item => dateKey(item.plannedAt)), ['2026-03-07', '2026-03-08', '2026-03-09']);
  } finally { if (original === undefined) delete process.env.TZ; else process.env.TZ = original; }
});
