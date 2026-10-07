import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { createDayloomServer } from '../server/app.mjs';
import { accountHttp, authenticatedSession, publicSession, type PrivateSession } from '../shared/account-http.mjs';
import { emptyData, mergeData } from '../shared/sync-data.mjs';
import { uuid } from '../shared/uuid.mjs';
import { WorkspaceController } from '../src/workspace';
import { createTask, tasksForView, validateData } from '../src/domain';
import type { WorkspaceAdapter, WorkspaceEnvelope } from '../src/account-types';
import type { AppData } from '../src/types';

const password = 'dayloom-test-password-2026';
async function service(database = ':memory:') {
  const server = createDayloomServer({ database });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const endpoint = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  return { endpoint, server, close: () => new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeIdleConnections(); }) };
}
function device(initialGuest = emptyData()) {
  let session: PrivateSession | null = null;
  let guest = structuredClone(initialGuest);
  const profiles = new Map<string, WorkspaceEnvelope>();
  const controls = { offline: false, loseReply: false };
  const adapter: WorkspaceAdapter = {
    loadGuest: async () => ({ data: structuredClone(guest), path: 'guest.json' }),
    saveGuest: async data => { guest = structuredClone(data); },
    flushGuest: data => { guest = structuredClone(data); return true; },
    session: async () => publicSession(session),
    async call(request) {
      if (request.operation === 'logout') { const old = session; session = null; if (!controls.offline) await accountHttp(request, old); return { status: 200, body: { ok: true } }; }
      if (controls.offline) throw new Error('Network unavailable');
      const result = await accountHttp(request, session);
      if (['register', 'login'].includes(request.operation) && result.status < 300) {
        session = authenticatedSession(request.endpoint!, result.body); return { status: result.status, body: { session: publicSession(session) } };
      }
      if (request.operation === 'push' && result.status === 200 && controls.loseReply) { controls.loseReply = false; throw new Error('Response lost after commit'); }
      return result;
    },
    loadProfile: async key => ({ envelope: profiles.has(key) ? structuredClone(profiles.get(key)!) : null, path: `profile-${key}` }),
    saveProfile: async (key, value) => { profiles.set(key, structuredClone(value)); },
    flushProfile: (key, value) => { profiles.set(key, structuredClone(value)); return true; },
  };
  return { adapter, controls, profiles, session: () => session, controller: () => new WorkspaceController(adapter, { automatic: false }) };
}
function taskData(task = createTask({ title: 'task' })) { return { ...emptyData(), tasks: [task] }; }
function changeTask(controller: WorkspaceController, patch: Partial<AppData['tasks'][number]>) { controller.update(data => ({ ...data, tasks: data.tasks.map(task => ({ ...task, ...patch })) })); }

test('非常重要任务每天展示，完成后停止，降级后恢复日期规则', () => {
  const today = '2026-10-07';
  const task = createTask({ title: '远期目标', priority: 4, date: '2027-06-01', timeWindow: { earliest: { date: '2027-01-01', time: null }, latest: { date: '2027-12-31', time: null } } });
  assert.equal(tasksForView(taskData(task), 'today', '', today).length, 1);
  assert.equal(tasksForView(taskData(task), 'today', '', '2026-12-01').length, 1);
  assert.equal(tasksForView(taskData({ ...task, priority: 3 }), 'today', '', today).length, 0);
  const done = { ...task, completed: true, completedAt: '2026-10-07T04:00:00.000Z' };
  assert.equal(tasksForView(taskData(done), 'today', '', today).length, 1);
  assert.equal(tasksForView(taskData(done), 'today', '', '2026-10-08').length, 0);
  const old = validateData(taskData(createTask({ title: '旧长期任务', longTerm: { startDate: '2026-11-01', doneDates: ['2026-10-06'] } })));
  assert.equal(old.tasks[0].priority, 4); assert.equal(old.tasks[0].longTerm, undefined);
  assert.deepEqual(old.tasks[0].legacyLongTerm?.doneDates, ['2026-10-06']);
});
test('三方合并：独立字段合并、同字段保留副本、删除不复活原 ID', () => {
  const base = taskData(), local = structuredClone(base), remote = structuredClone(base);
  local.tasks[0].notes = '本机备注'; remote.tasks[0].title = '另一台设备的标题';
  const merged = mergeData(base, local, remote);
  assert.equal(merged.conflicts, 0); assert.equal(merged.data.tasks[0].notes, '本机备注'); assert.equal(merged.data.tasks[0].title, remote.tasks[0].title);
  remote.tasks[0].notes = '另一台备注';
  const conflict = mergeData(base, local, remote);
  assert.equal(conflict.conflicts, 1); assert.equal(conflict.data.tasks.length, 2);
  assert.ok(conflict.data.tasks.some(task => task.notes === '本机备注' && task.id !== base.tasks[0].id));
  const deletion = mergeData(base, local, { ...remote, tasks: [] });
  assert.ok(!deletion.data.tasks.some(task => task.id === base.tasks[0].id)); assert.equal(deletion.conflicts, 1);
});
test('周期并发改规则、刷新时刻与单期排期时保留冲突，避免混用同版本的打卡', () => {
  const group = { id: uuid(), name: '日常', color: '#5a80ed', utcOffset: 480, resetTime: '00:00', weekResetDay: 1, monthResetDay: 1 };
  const activity = { id: uuid(), gameId: group.id, title: '练习', kind: 'daily' as const, weekdays: [] as number[], target: 5, planTime: '12:00', planWeekday: 1, planMonthDay: 1, minutes: 10, energy: 0, notes: '', paused: false, startDate: '2026-10-07', revision: 1, anytime: true };
  const base: AppData = { ...emptyData(), gaming: { games: [group], activities: [activity], progress: [] } };
  const local = structuredClone(base), remote = structuredClone(base);
  local.gaming!.activities[0] = { ...activity, revision: 2, kind: 'material', weekdays: [3] };
  remote.gaming!.activities[0] = { ...activity, revision: 2, kind: 'weekly' };
  local.gaming!.progress = [{ activityId: activity.id, revision: 2, periodStart: '2026-10-07', count: 1 }];
  remote.gaming!.progress = [{ activityId: activity.id, revision: 2, periodStart: '2026-10-07', count: 2 }];
  const changed = mergeData(base, local, remote);
  assert.equal(changed.data.gaming!.activities[0].kind, 'weekly');
  assert.equal(changed.data.gaming!.progress[0].count, 2);
  assert.equal(changed.conflicts, 2);
  const windowed = structuredClone(base), reset = structuredClone(base);
  windowed.gaming!.activities[0] = { ...activity, anytime: false, timeWindow: { earliest: '00:30', latest: '01:30' } };
  reset.gaming!.games[0].resetTime = '01:00';
  const combined = mergeData(base, windowed, reset);
  assert.equal(combined.conflicts, 1);
  assert.equal(combined.data.gaming!.activities[0].anytime, true);
  const scheduled = structuredClone(base);
  scheduled.gaming!.progress = [{ activityId: activity.id, revision: 1, periodStart: '2026-10-07', count: 0, plannedAt: '2026-10-07T04:00:00.000Z', allDay: false }];
  const allDay = structuredClone(scheduled), cleared = structuredClone(scheduled);
  allDay.gaming!.progress[0].allDay = true;
  delete cleared.gaming!.progress[0].plannedAt; delete cleared.gaming!.progress[0].allDay;
  const planning = mergeData(scheduled, allDay, cleared);
  assert.equal(planning.conflicts, 1);
  assert.equal(planning.data.gaming!.progress[0].plannedAt, undefined);
  assert.doesNotThrow(() => validateData(planning.data));
});
test('两台设备：注册、共享任务、离线重连、并发字段编辑、删除同步', async () => {
  const server = await service(), a = device(), b = device(), first = a.controller(), second = b.controller();
  try {
    await first.start(); await second.start();
    await first.login('register', server.endpoint, 'two_devices', password, '两台设备', false);
    await second.login('login', server.endpoint, 'two_devices', password, '', false);
    first.update(data => ({ ...data, tasks: [createTask({ title: '同步测试', priority: 4, date: '2027-01-01' })] }));
    await first.syncNow(); await second.syncNow(); assert.equal(second.getSnapshot().data!.tasks[0].title, '同步测试');
    b.controls.offline = true; changeTask(second, { notes: '离线记录' }); await second.syncNow(); assert.equal(second.getSnapshot().syncStatus, 'offline');
    changeTask(first, { title: '设备一改标题' }); await first.syncNow();
    b.controls.offline = false; await second.syncNow(); await first.syncNow();
    assert.equal(first.getSnapshot().data!.tasks[0].notes, '离线记录'); assert.equal(second.getSnapshot().data!.tasks[0].title, '设备一改标题');
    first.update(data => ({ ...data, tasks: [] })); await first.syncNow(); await second.syncNow(); assert.equal(second.getSnapshot().data!.tasks.length, 0);
  } finally { first.stop(); second.stop(); await server.close(); }
});
test('响应丢失后重启：持久化请求去重，不重复计算周期打卡', async () => {
  const server = await service(), a = device(), b = device(); let first = a.controller(); const second = b.controller();
  try {
    await first.start(); await second.start(); await first.login('register', server.endpoint, 'lost_response', password, '', false); await second.login('login', server.endpoint, 'lost_response', password, '', false);
    const group = { id: uuid(), name: '日常', color: '#5a80ed', utcOffset: 480, resetTime: '00:00', weekResetDay: 1, monthResetDay: 1 };
    const activity = { id: uuid(), gameId: group.id, title: '练习', kind: 'daily' as const, weekdays: [], target: 5, planTime: '12:00', planWeekday: 1, planMonthDay: 1, minutes: 10, energy: 0, notes: '', paused: false, startDate: '2026-10-07', revision: 1 };
    first.update(data => ({ ...data, gaming: { games: [group], activities: [activity], progress: [{ activityId: activity.id, revision: 1, periodStart: '2026-10-07', count: 0 }] } }));
    await first.syncNow(); await second.syncNow();
    for (const controller of [first, second]) controller.update(data => ({ ...data, gaming: { ...data.gaming!, progress: data.gaming!.progress.map(item => ({ ...item, count: 1 })) } }));
    await first.syncNow(); b.controls.loseReply = true; await second.syncNow();
    assert.equal(second.getSnapshot().syncStatus, 'offline'); assert.ok([...b.profiles.values()][0].sync.pending);
    second.stop(); const reopened = b.controller();
    try { await reopened.start(); await reopened.syncNow(); assert.equal(reopened.getSnapshot().data!.gaming!.progress[0].count, 2); assert.equal(reopened.getSnapshot().syncStatus, 'synced'); await first.syncNow(); assert.equal(first.getSnapshot().data!.gaming!.progress[0].count, 2); }
    finally { reopened.stop(); }
  } finally { first.stop(); second.stop(); await server.close(); }
});
test('账号切换隔离缓存；离线退出后恢复访客数据；合并本机数据需选择', async () => {
  const server = await service(), guest = taskData(createTask({ title: '本机原任务' })), local = device(guest), controller = local.controller();
  try {
    await controller.start(); await controller.login('register', server.endpoint, 'account_alpha', password, '', true);
    assert.equal(controller.getSnapshot().data!.tasks[0].title, '本机原任务');
    changeTask(controller, { title: '账号 A 的任务' }); await controller.syncNow(); await controller.logout();
    assert.equal(controller.getSnapshot().data!.tasks[0].title, '本机原任务');
    await controller.login('register', server.endpoint, 'account_beta', password, '', false);
    assert.equal(controller.getSnapshot().data!.tasks.length, 0);
    local.controls.offline = true; controller.update(data => ({ ...data, tasks: [createTask({ title: '账号 B 离线任务' })] })); await controller.logout();
    assert.equal(controller.getSnapshot().data!.tasks[0].title, '本机原任务');
    local.controls.offline = false; await controller.login('login', server.endpoint, 'account_alpha', password, '', false);
    assert.equal(controller.getSnapshot().data!.tasks[0].title, '账号 A 的任务'); await controller.logout();
    await controller.login('login', server.endpoint, 'account_beta', password, '', false); assert.equal(controller.getSnapshot().data!.tasks[0].title, '账号 B 离线任务');
  } finally { controller.stop(); await server.close(); }
});
test('认证隔离、非法数据拒绝、旧版本拒绝、请求重放与密码撤销会话', async () => {
  const server = await service();
  try {
    const first = await accountHttp({ operation: 'register', endpoint: server.endpoint, body: { username: 'security_user', password } }, null);
    const tokenA = authenticatedSession(server.endpoint, first.body);
    const next = await accountHttp({ operation: 'login', endpoint: server.endpoint, body: { username: 'security_user', password } }, null);
    const tokenB = authenticatedSession(server.endpoint, next.body);
    const other = await accountHttp({ operation: 'register', endpoint: server.endpoint, body: { username: 'another_user', password } }, null);
    const tokenOther = authenticatedSession(server.endpoint, other.body);
    const request = { id: uuid(), revision: 0, data: taskData(createTask({ title: 'private' })) };
    assert.equal((await accountHttp({ operation: 'push', body: request }, tokenA)).status, 200);
    assert.equal((await accountHttp({ operation: 'push', body: request }, tokenA)).body.revision, 1);
    assert.equal((await accountHttp({ operation: 'push', body: { ...request, id: uuid() } }, tokenA)).status, 409);
    assert.equal((await accountHttp({ operation: 'push', body: { ...request, data: emptyData() } }, tokenA)).status, 409);
    assert.equal((await accountHttp({ operation: 'pull' }, tokenOther)).body.revision, 0);
    assert.equal((await accountHttp({ operation: 'push', body: { id: uuid(), revision: 1, data: { ...emptyData(), tasks: [{ title: 'invalid' }] } } }, tokenA)).status, 400);
    assert.equal((await accountHttp({ operation: 'password', body: { currentPassword: password, password: 'dayloom-updated-password' } }, tokenA)).status, 200);
    assert.equal((await accountHttp({ operation: 'pull' }, tokenB)).status, 401);
    assert.equal((await accountHttp({ operation: 'pull' }, tokenA)).status, 200);
    await accountHttp({ operation: 'logout' }, tokenA);
    assert.equal((await accountHttp({ operation: 'pull' }, tokenA)).status, 401);
  } finally { await server.close(); }
});
test('SQLite 重启保留账号和数据；密码与会话令牌不以明文存储', async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'dayloom-db-')), file = path.join(folder, 'account.sqlite');
  let server = await service(file);
  try {
    const result = await accountHttp({ operation: 'register', endpoint: server.endpoint, body: { username: 'persistent_user', password } }, null);
    const session = authenticatedSession(server.endpoint, result.body);
    await accountHttp({ operation: 'push', body: { id: uuid(), revision: 0, data: taskData(createTask({ title: '服务重启后仍保留' })) } }, session);
    await server.close();
    const database = new DatabaseSync(file);
    assert.ok(!String(database.prepare('SELECT password FROM users').get()!.password).includes(password));
    assert.notEqual(database.prepare('SELECT token_hash FROM sessions').get()!.token_hash, session.token); database.close();
    server = await service(file);
    const response = await accountHttp({ operation: 'pull' }, { ...session, endpoint: server.endpoint });
    assert.equal(response.status, 200); assert.equal((response.body.data as AppData).tasks[0].title, '服务重启后仍保留');
  } finally { await server.close(); await rm(folder, { recursive: true, force: true }); }
});

test('会话撤销后保持登录提示和离线编辑，重新认证后发送积累的修改', async () => {
  const server = await service(), a = device(), b = device(), first = a.controller(), second = b.controller();
  try {
    await first.start(); await second.start();
    await first.login('register', server.endpoint, 'expired_session', password, '', false);
    await second.login('login', server.endpoint, 'expired_session', password, '', false);
    await first.changePassword(password, 'new-dayloom-password');
    await second.syncNow(); assert.equal(second.getSnapshot().syncStatus, 'expired');
    second.update(data => ({ ...data, tasks: [createTask({ title: '重新登录前编辑' })] }));
    await second.syncNow(); assert.equal(second.getSnapshot().syncStatus, 'expired');
    await second.login('login', server.endpoint, 'expired_session', 'new-dayloom-password', '', false);
    await first.syncNow(); assert.equal(first.getSnapshot().data!.tasks[0].title, '重新登录前编辑');
  } finally { first.stop(); second.stop(); await server.close(); }
});
