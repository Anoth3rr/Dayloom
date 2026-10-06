import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, createTask, dateKey, dayEvents, deleteList, monthDays, moveTaskTo, seedData, shiftMonth, sortTasks, startOfWeek, tasksForView, validateData } from '../src/domain';

test('示例数据可校验、保存并恢复中文和子任务', () => {
  const data = seedData('2026-10-07');
  assert.deepEqual(validateData(JSON.parse(JSON.stringify(data))), data);
  assert.equal(data.tasks.filter(t => t.date === '2026-10-07').length, 7);
});
test('本地日期不受 UTC 日期边界影响', () => {
  assert.equal(dateKey(new Date(2026, 9, 7, 0, 1)), '2026-10-07');
  assert.equal(dateKey(new Date(2026, 9, 7, 23, 59)), '2026-10-07');
});
test('日期移动处理闰年、跨月、跨年', () => {
  assert.equal(addDays('2024-02-28', 1), '2024-02-29');
  assert.equal(addDays('2026-02-28', 1), '2026-03-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(shiftMonth('2026-01-31', 1), '2026-02-01');
});
test('月历从周一开始，跨年日历含完整的 42 天', () => {
  assert.equal(startOfWeek('2026-10-11'), '2026-10-05');
  const grid = monthDays('2027-01-01');
  assert.equal(grid.length, 42); assert.equal(grid[0], '2026-12-28');
  assert.equal(new Set(grid).size, 42);
});
test('今天包含逾期待办，但不混入早已完成的任务', () => {
  const data = seedData('2026-10-07');
  data.tasks.push(createTask({ title: '过期待办', date: '2026-10-01' }));
  data.tasks.push(createTask({ title: '过期已完成', date: '2026-10-01', completed: true }));
  const result = tasksForView(data, 'today', '', '2026-10-07');
  assert.equal(result.length, 8); assert.ok(result.some(t => t.title === '过期待办'));
  assert.ok(!result.some(t => t.title === '过期已完成'));
});
test('最近 7 天包含今日和第 7 天，排除第 8 天', () => {
  const data = seedData('2026-10-07');
  data.tasks = [0, 6, 7, -1].map(i => createTask({ title: String(i), date: addDays('2026-10-07', i) }));
  assert.deepEqual(tasksForView(data, 'week', '', '2026-10-07').map(t => t.title), ['0', '6']);
});
test('搜索覆盖子任务和清单名称，支持大小写无关匹配', () => {
  const data = seedData('2026-10-07');
  assert.equal(tasksForView(data, 'search', '明确三个').length, 1);
  assert.ok(tasksForView(data, 'search', '学习成长').length >= 2);
  data.tasks.push(createTask({ title: 'Read TypeScript' }));
  assert.equal(tasksForView(data, 'search', 'typescript').length, 1);
});
test('优先级排序不会修改原数组', () => {
  const data = seedData(); const original = data.tasks.map(t => t.id);
  const sorted = sortTasks(data.tasks, 'priority');
  assert.equal(sorted[0].priority, 3);
  assert.deepEqual(data.tasks.map(t => t.id), original);
});
test('重叠日程分配独立列，相邻日程复用一列', () => {
  const date = '2026-10-07';
  const tasks = [
    createTask({ title: 'A', date, time: '09:00', duration: 120 }),
    createTask({ title: 'B', date, time: '09:30', duration: 30 }),
    createTask({ title: 'C', date, time: '10:00', duration: 120 }),
    createTask({ title: 'D', date, time: '12:00', duration: 60 }),
  ];
  const events = dayEvents(tasks, date);
  assert.deepEqual(events.map(e => [e.lane, e.lanes]), [[0, 2], [1, 2], [1, 2], [0, 1]]);
});
test('跨午夜事件被切分，次日保留接续标记', () => {
  const task = createTask({ title: '夜间任务', date: '2026-12-31', time: '23:30', duration: 120 });
  const first = dayEvents([task], '2026-12-31')[0];
  const next = dayEvents([task], '2027-01-01')[0];
  assert.deepEqual([first.start, first.end, first.continuation], [1410, 1440, false]);
  assert.deepEqual([next.start, next.end, next.continuation], [0, 90, true]);
});
test('移动到全天关闭定时提醒，保留任务与时长', () => {
  const task = createTask({ title: '日程', date: '2026-10-07', time: '10:00', reminder: true, duration: 90, example: true });
  const moved = moveTaskTo(task, '2026-10-08', null);
  assert.equal(moved.reminder, false); assert.equal(moved.time, null);
  assert.equal(moved.id, task.id); assert.equal(moved.duration, 90); assert.equal(moved.example, false);
});
test('删除清单将任务移回收集箱，不丢失任务', () => {
  const data = seedData(); const next = deleteList(data, 'work');
  assert.equal(next.tasks.length, data.tasks.length);
  assert.ok(!next.tasks.some(t => t.listId === 'work'));
  assert.equal(next.lists.length, data.lists.length - 1);
  assert.doesNotThrow(() => validateData(next));
  assert.deepEqual(deleteList(data, 'inbox'), data);
});
test('拒绝损坏的导入：不合法日期、重复 ID、孤立清单', () => {
  for (const edit of [
    (data: ReturnType<typeof seedData>) => { data.tasks[0].date = '2026-02-30'; },
    (data: ReturnType<typeof seedData>) => { data.tasks[1].id = data.tasks[0].id; },
    (data: ReturnType<typeof seedData>) => { data.tasks[0].listId = 'missing'; },
    (data: ReturnType<typeof seedData>) => { data.tasks[0].time = '24:00'; },
    (data: ReturnType<typeof seedData>) => { data.tasks[0].duration = -10; },
    (data: ReturnType<typeof seedData>) => { data.tasks[0].title = ' '; },
    (data: ReturnType<typeof seedData>) => { data.settings.glass = 0; },
    (data: ReturnType<typeof seedData>) => { data.tasks[0].date = null; },
  ]) { const data = seedData(); edit(data); assert.throws(() => validateData(data), /备份格式不正确/); }
});
