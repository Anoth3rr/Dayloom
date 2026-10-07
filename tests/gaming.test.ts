import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dateKey, seedData, validateData } from '../src/domain';
import { addGameExamples, calendarData, changeProgress, currentOccurrences, gameDay, newActivity, newGame, occurrencesInRange, periodFor, planOccurrence, removeActivity, removeGame, resolveOccurrence, saveActivity, saveGame } from '../src/gaming';
import type { AppData, GameActivity, GameProfile } from '../src/types';

const now = new Date('2026-10-07T12:00:00.000Z');
function fixture(activityPatch: Partial<GameActivity> = {}, gamePatch: Partial<GameProfile> = {}): AppData {
  const game = { ...newGame(), name: '测试游戏', ...gamePatch };
  return { ...seedData(), tasks: [], gaming: { games: [game], activities: [{ ...newActivity(game, now), title: '周期目标', startDate: '2026-01-01', ...activityPatch }], progress: [] } };
}
test('旧备份保持兼容，通用示例可完整导入导出', () => {
  const old = seedData(); assert.equal(validateData(old), old);
  const data = addGameExamples(old, now);
  assert.deepEqual(validateData(JSON.parse(JSON.stringify(data))), data);
  assert.equal(data.tasks.length, old.tasks.length);
  assert.equal(data.gaming!.activities.length, 5);
});
test('凌晨 4 点之前仍属于前一游戏日，边界当秒进入新周期', () => {
  const game = newGame();
  assert.equal(gameDay(game, new Date('2026-10-06T19:59:59.999Z')), '2026-10-06');
  assert.equal(gameDay(game, new Date('2026-10-06T20:00:00.000Z')), '2026-10-07');
  const data = fixture(); const before = currentOccurrences(data, new Date('2026-10-06T19:59:59.999Z'))[0];
  assert.equal(before.ref.periodStart, '2026-10-06');
  const done = changeProgress(data, before.ref, 1, new Date('2026-10-06T19:59:59.999Z'));
  assert.equal(currentOccurrences(done, new Date('2026-10-06T20:00:00Z'))[0].count, 0);
  assert.equal(done.gaming!.progress[0].count, 1);
});
test('材料本只在选定游戏星期开放，并跨凌晨保留同一进度', () => {
  const data = fixture({ kind: 'material', weekdays: [1, 4, 0], target: 3 });
  assert.equal(currentOccurrences(data, now).length, 0); // Wednesday
  const monday = new Date('2026-10-05T12:00:00Z');
  const item = currentOccurrences(data, monday)[0];
  const done = changeProgress(data, item.ref, 2, monday);
  assert.equal(currentOccurrences(done, new Date('2026-10-05T19:59:59Z'))[0].count, 2);
  assert.equal(currentOccurrences(done, new Date('2026-10-05T20:00:00Z')).length, 0);
  assert.equal(currentOccurrences(done, new Date('2026-10-08T12:00:00Z'))[0].count, 0);
});
test('每周目标贯穿完整周期，周一凌晨刷新后独立计数', () => {
  const data = fixture({ kind: 'weekly', target: 3 }); const item = currentOccurrences(data, now)[0];
  assert.equal(item.ref.periodStart, '2026-10-05');
  assert.equal(item.end.toISOString(), '2026-10-11T20:00:00.000Z');
  const done = changeProgress(data, item.ref, 3, now);
  assert.equal(currentOccurrences(done, new Date('2026-10-11T19:59:59Z'))[0].count, 3);
  assert.equal(currentOccurrences(done, new Date('2026-10-11T20:00:00Z'))[0].count, 0);
  assert.throws(() => changeProgress(done, item.ref, 2, new Date('2026-10-11T20:00:00Z')), /当前刷新周期/);
});
test('自定义周刷新日与计划星期分别生效', () => {
  const data = fixture({ kind: 'weekly', planWeekday: 1 }, { weekResetDay: 4 });
  const item = currentOccurrences(data, now)[0];
  assert.equal(item.ref.periodStart, '2026-10-01');
  assert.equal(item.plannedAt.toISOString(), '2026-10-05T12:00:00.000Z');
  assert.equal(item.end.toISOString(), '2026-10-07T20:00:00.000Z');
});
test('月末刷新正确处理非闰年、闰年、跨年', () => {
  for (const [stamp, start, end] of [
    ['2026-02-27T20:00:00Z', '2026-02-28', '2026-03-30T20:00:00.000Z'],
    ['2024-02-28T20:00:00Z', '2024-02-29', '2024-03-30T20:00:00.000Z'],
    ['2026-12-31T12:00:00Z', '2026-12-31', '2027-01-30T20:00:00.000Z'],
  ]) {
    const data = fixture({ kind: 'monthly', startDate: '2020-01-01', planMonthDay: 31 }, { monthResetDay: 31 });
    const item = currentOccurrences(data, new Date(stamp))[0];
    assert.equal(item.ref.periodStart, start); assert.equal(item.end.toISOString(), end);
    assert.ok(item.plannedAt >= item.start && item.plannedAt < item.end);
  }
});
test('月中刷新可把计划排到下个月，但不会越过本期结束', () => {
  const data = fixture({ kind: 'monthly', planMonthDay: 1 }, { monthResetDay: 15 });
  const item = currentOccurrences(data, now)[0];
  assert.equal(item.ref.periodStart, '2026-09-15');
  assert.equal(item.plannedAt.toISOString(), '2026-10-01T12:00:00.000Z');
});
test('同一时刻，不同服务器时区拥有不同游戏日', () => {
  const at = new Date('2026-10-07T00:00:00Z');
  assert.equal(gameDay({ ...newGame(), utcOffset: -300 }, at), '2026-10-06');
  assert.equal(gameDay({ ...newGame(), utcOffset: 540 }, at), '2026-10-07');
  assert.equal(gameDay({ ...newGame(), utcOffset: 345 }, at), '2026-10-07');
});
test('刷新前的凌晨计划安排在次日，投影使用本机时间', () => {
  const data = fixture({ planTime: '02:30' }); const item = currentOccurrences(data, now)[0];
  assert.equal(item.plannedAt.toISOString(), '2026-10-07T18:30:00.000Z');
  const day = dateKey(item.plannedAt), projected = calendarData(data, day, day);
  assert.ok(projected.tasks.some(task => task.date === day && task.gameOccurrence?.periodStart === '2026-10-07'));
  assert.equal(data.tasks.length, 0);
  assert.throws(() => validateData(projected), /周期活动不能作为普通任务/);
});
test('每周、每月投影去重，未来周期独立且不能提前打卡', () => {
  const data = fixture({ kind: 'weekly', target: 3, planWeekday: 6 });
  const items = occurrencesInRange(data, '2026-10-05', '2026-10-18');
  assert.equal(items.length, 2); assert.notDeepEqual(items[0].ref, items[1].ref);
  assert.throws(() => changeProgress(data, items[1].ref, 1, now), /当前刷新周期/);
  assert.equal(occurrencesInRange(fixture({ kind: 'monthly' }), '2026-10-01', '2026-10-31').length, 1);
});
test('本机与服务器相差 26 小时时，跨午夜计划仍能落到正确日期', () => {
  const originalTZ = process.env.TZ;
  try {
    process.env.TZ = 'Pacific/Kiritimati';
    const at = new Date('2026-10-07T11:58:00Z');
    assert.equal(at.getTimezoneOffset(), -840);
    const data = fixture({ planTime: '23:58' }, { utcOffset: -720, resetTime: '23:59' });
    const item = currentOccurrences(data, at)[0];
    assert.equal(item.ref.periodStart, '2026-10-05');
    assert.equal(dateKey(item.plannedAt), '2026-10-08');
    assert.ok(occurrencesInRange(data, '2026-10-08', '2026-10-08').some(value => value.ref.periodStart === '2026-10-05'));
  } finally { if (originalTZ === undefined) delete process.env.TZ; else process.env.TZ = originalTZ; }
});
test('周中创建的活动仍可完成本周目标，过去的计划夹到开始日', () => {
  const data = fixture({ kind: 'weekly', startDate: '2026-10-07', planWeekday: 1 });
  const item = currentOccurrences(data, now)[0];
  assert.equal(item.ref.periodStart, '2026-10-05');
  assert.equal(item.plannedAt.toISOString(), '2026-10-07T12:00:00.000Z');
  assert.equal(currentOccurrences(data, new Date('2026-10-06T12:00:00Z')).length, 0);
  assert.equal(occurrencesInRange(data, '2026-09-01', '2026-10-04').length, 0);
});
test('按期调整时间保留打卡次数，拒绝跨周期和材料本关闭时间', () => {
  const data = fixture({ kind: 'weekly', target: 3 }); const item = currentOccurrences(data, now)[0];
  const localDay = dateKey(now), localHour = String(now.getHours()).padStart(2, '0') + ':30';
  const changed = planOccurrence(changeProgress(data, item.ref, 2, now), item.ref, localDay, localHour);
  assert.equal(resolveOccurrence(changed, item.ref)!.count, 2);
  assert.equal(dateKey(resolveOccurrence(changed, item.ref)!.plannedAt), localDay);
  assert.throws(() => planOccurrence(data, item.ref, '2026-10-21', '12:00'), /本期开放/);
  const material = fixture({ kind: 'material', weekdays: [3] });
  assert.throws(() => planOccurrence(material, currentOccurrences(material, now)[0].ref, '2026-10-09', '12:00'), /本期开放/);
});
test('单期计划改到另一天后仍能在仅一天的查询中检索出来', () => {
  const data = fixture({ kind: 'weekly', target: 3 }); const item = currentOccurrences(data, now)[0];
  const day = dateKey(now), changed = planOccurrence(data, item.ref, day, null);
  const items = occurrencesInRange(changed, day, day);
  assert.equal(items.length, 1); assert.equal(items[0].allDay, true);
  assert.equal(calendarData(changed, day, day).tasks[0].time, null);
});
test('目标次数上下限保护，可逐次完成和撤销', () => {
  const data = fixture({ target: 3 }); const ref = currentOccurrences(data, now)[0].ref;
  const full = changeProgress(data, ref, 100, now);
  assert.equal(currentOccurrences(full, now)[0].count, 3);
  assert.equal(currentOccurrences(changeProgress(full, ref, 2, now), now)[0].count, 2);
  assert.equal(currentOccurrences(changeProgress(full, ref, -5, now), now)[0].count, 0);
});
test('修改名称/目标保留进度；修改开放规则隔离旧进度', () => {
  const data = fixture({ target: 3 }); const item = currentOccurrences(data, now)[0];
  const done = changeProgress(data, item.ref, 2, now);
  const renamed = saveActivity(done, { ...item.activity, title: '新名称', target: 5 });
  assert.equal(currentOccurrences(renamed, now)[0].count, 2);
  const changed = saveActivity(renamed, { ...renamed.gaming!.activities[0], kind: 'weekly' });
  assert.equal(currentOccurrences(changed, now)[0].count, 0);
  assert.equal(changed.gaming!.progress.length, 1);
  assert.equal(changed.gaming!.activities[0].revision, 2);
  assert.throws(() => changeProgress(changed, item.ref, 3, now), /规则已更新/);
});
test('修改服务器刷新规则会更新该游戏的所有活动版本', () => {
  const data = fixture(); const item = currentOccurrences(data, now)[0];
  const done = changeProgress(data, item.ref, 1, now);
  const unchanged = saveGame(done, { ...item.game, name: '只改名' });
  assert.equal(currentOccurrences(unchanged, now)[0].count, 1);
  const changed = saveGame(unchanged, { ...item.game, resetTime: '05:00' });
  assert.equal(currentOccurrences(changed, now)[0].count, 0);
  assert.equal(changed.gaming!.activities[0].revision, 2);
});
test('暂停隐藏安排、保留进度；恢复后仍能看到本期已完成', () => {
  const data = fixture(); const item = currentOccurrences(data, now)[0];
  const done = changeProgress(data, item.ref, 1, now);
  const paused = saveActivity(done, { ...item.activity, paused: true });
  assert.equal(currentOccurrences(paused, now).length, 0);
  assert.equal(occurrencesInRange(paused, '2026-10-01', '2026-10-31').length, 0);
  const resumed = saveActivity(paused, { ...item.activity, paused: false });
  assert.equal(currentOccurrences(resumed, now)[0].count, 1);
});
test('删除活动或游戏时清理相关进度，不影响普通任务', () => {
  const data = addGameExamples(seedData(), now); const item = currentOccurrences(data, now)[0];
  const done = changeProgress(data, item.ref, 1, now);
  assert.equal(removeActivity(done, item.activity.id).gaming!.progress.length, 0);
  const removed = removeGame(done, item.game.id);
  assert.equal(removed.gaming!.activities.length, 0); assert.equal(removed.gaming!.progress.length, 0);
  assert.deepEqual(removed.tasks, data.tasks);
});
test('备份拒绝非法规则、悬空记录、重复周期和不存在的日期', () => {
  const data = fixture(); const item = currentOccurrences(data, now)[0];
  for (const mutate of [
    (d: AppData) => { d.gaming!.games[0].utcOffset = 481; },
    (d: AppData) => { d.gaming!.games[0].monthResetDay = 32; },
    (d: AppData) => { d.gaming!.activities[0].gameId = 'missing'; },
    (d: AppData) => { d.gaming!.activities[0].weekdays = [7]; },
    (d: AppData) => { d.gaming!.activities[0].kind = 'material'; d.gaming!.activities[0].weekdays = []; },
    (d: AppData) => { d.gaming!.progress = [{ ...item.ref, count: 1 }, { ...item.ref, count: 0 }]; },
    (d: AppData) => { d.gaming!.progress = [{ ...item.ref, count: 1, plannedAt: '2026-02-30T12:00:00.000Z' }]; },
  ]) { const bad = structuredClone(data); mutate(bad); assert.throws(() => validateData(bad), /周期事务格式/); }
});
test('所有周期计划都落在实际开放区间内（完整闰年及极端时区）', () => {
  for (const offset of [-720, 345, 840]) for (const reset of [1, 15, 29, 31]) {
    const data = fixture({ kind: 'monthly', startDate: '2020-01-01', planTime: '01:00', planMonthDay: 31 }, { utcOffset: offset, monthResetDay: reset });
    for (let month = 1; month <= 12; month++) {
      const at = new Date(`2024-${String(month).padStart(2, '0')}-28T12:00:00Z`);
      const item = currentOccurrences(data, at)[0];
      assert.ok(item.plannedAt >= item.start && item.plannedAt < item.end);
      assert.ok(periodFor(item.activity, item.game, gameDay(item.game, at)));
    }
  }
});
