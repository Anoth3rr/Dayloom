import { useState } from 'react';
import { CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, Gamepad2, Gem, Pause, Pencil, Play, Plus, Repeat2, Settings2, Sparkles, Zap } from 'lucide-react';
import { addDays, dateKey, friendlyDate, parseDate, startOfWeek, WEEKDAYS } from '../domain';
import { addGameExamples, changeProgress, currentOccurrences, gameDay, gamingData, kindName, localTime, newActivity, occurrenceKey, occurrenceTimeLabel, occurrencesInRange, remainingLabel, ruleLabel, saveActivity, todayRoutines, zoneLabel } from '../gaming';
import type { GameOccurrence, OccurrenceRef } from '../gaming';
import type { AppData, GameActivity } from '../types';
import { accentStyle, IconButton } from './ui';
import { ProgressControls } from './GameEditors';
import type { DataUpdate, GameDialog } from './GameEditors';

export function GamePlanner({ data, now, update, onDialog }: { data: AppData; now: Date; update: DataUpdate; onDialog: (dialog: GameDialog) => void }) {
  const [tab, setTab] = useState<'today' | 'week' | 'rules'>('today');
  const [filter, setFilter] = useState('all');
  const [category, setCategory] = useState<'all' | 'routine' | 'game'>('all');
  const [anchor, setAnchor] = useState(dateKey(now));
  const gaming = gamingData(data), today = dateKey(now);
  const selected = gaming.games.some(game => game.id === filter) ? filter : 'all';
  const visibleGames = gaming.games.filter(game => category === 'all' || (game.category || 'game') === category);
  const games = visibleGames.filter(game => selected === 'all' || game.id === selected);
  const includes = (id: string) => games.some(game => game.id === id);
  const activities = gaming.activities.filter(activity => includes(activity.gameId));
  const current = currentOccurrences(data, now).filter(item => includes(item.game.id));
  const pending = current.filter(item => item.count < item.activity.target);
  const weekStart = startOfWeek(anchor), days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const week = occurrencesInRange(data, days[0], days[6]).filter(item => includes(item.game.id));
  const todayPlan = pending.filter(item => item.activity.kind === 'daily' || item.activity.kind === 'material' || dateKey(item.plannedAt) === today);
  const plannedMinutes = todayPlan.reduce((sum, item) => sum + (item.activity.target - item.count) * item.activity.minutes, 0);
  function create() {
    const game = selected !== 'all' ? games[0] : games.find(game => (game.category || 'game') === (category === 'game' ? 'game' : 'routine'));
    onDialog(game ? { kind: 'activity', activity: newActivity(game, now), isNew: true } : { kind: 'game', addAfter: true, category: category === 'game' ? 'game' : 'routine' });
  }
  const open = (ref: OccurrenceRef) => onDialog({ kind: 'occurrence', ref });
  const edit = (activity: GameActivity) => onDialog({ kind: 'activity', activity, isNew: false });
  const change = (item: GameOccurrence, count: number) => update(data => changeProgress(data, item.ref, count, new Date()));
  const closed = activities.filter(activity => !activity.paused && activity.kind === 'material' && !current.some(item => item.activity.id === activity.id));
  return <main className="game-main">
    <header className="page-header"><div><h1>周期事务 <Repeat2 size={26} strokeWidth={1.6} /></h1></div><button className="button primary" onClick={create}><Plus size={17} />新建事务</button></header>
    <div className="game-topbar"><select className="category-filter" aria-label="事务类别" value={category} onChange={event => { setCategory(event.target.value as typeof category); setFilter('all'); }}><option value="all">全部类别</option><option value="routine">普通事务</option><option value="game">游戏活动</option></select><div className="game-filters" aria-label="筛选分组"><button className={selected === 'all' ? 'selected' : ''} onClick={() => setFilter('all')}>全部分组</button>{visibleGames.map(game => <button key={game.id} className={selected === game.id ? 'selected' : ''} style={accentStyle(game.color)} onClick={() => setFilter(game.id)}><i />{game.name}</button>)}</div><button className="game-settings-button" onClick={() => onDialog({ kind: 'games' })}><Settings2 size={16} />管理分组</button></div>
    {gaming.activities.length ? <><div className="game-tabs" role="tablist" aria-label="周期事务视图">{([['today', '今日待办'], ['week', '一周规划'], ['rules', '规则管理']] as const).map(([id, title]) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'selected' : ''} onClick={() => setTab(id)}>{title}</button>)}</div>
      <div className={`game-scroll ${tab === 'week' ? 'game-week-scroll' : ''}`}>
        {tab === 'today' && <>
          <div className="game-overview"><div className="game-overview-icon"><Repeat2 size={29} strokeWidth={1.5} /></div><div><h2>{current.length ? '本期进度' : '暂无周期事务'}</h2><p>{pending.length ? `当前还有 ${pending.length} 项目标，今天计划约 ${plannedMinutes} 分钟。` : current.length ? '本期目标已全部完成。' : '可在一周规划中查看后续安排。'}</p></div><div className="game-overview-progress"><strong>{current.length - pending.length}<span> / {current.length}</span></strong><small>本期已完成</small></div></div>
          <div className="game-reset-strip">{games.map(game => <span key={game.id} style={accentStyle(game.color)}><i /><strong>{game.name}</strong><span>周期日 {gameDay(game, now).slice(5).replace('-', '/')} · {game.resetTime} 刷新 · {game.clock === 'local' ? '本机时间' : zoneLabel(game.utcOffset)}</span></span>)}</div>
          {(['today', 'weekly', 'monthly'] as const).map(group => {
            const items = current.filter(item => group === 'today' ? ['material', 'daily'].includes(item.activity.kind) : item.activity.kind === group).sort((a, b) => Number(a.count >= a.activity.target) - Number(b.count >= b.activity.target) || a.plannedAt.getTime() - b.plannedAt.getTime());
            if (!items.length) return null;
            return <section className="game-section" key={group}><div className="game-section-title"><h2>{group === 'today' ? <Gem size={17} /> : <CalendarDays size={17} />}{group === 'today' ? '每日与指定星期' : group === 'weekly' ? '本周目标' : '本月目标'}<span>{items.length}</span></h2><span>{group === 'today' ? '当天完成，刷新后重新计数' : '周期内完成即可，无需每天重复'}</span></div><div className="game-card-grid">{items.map(item => <ActivityCard key={occurrenceKey(item.ref)} item={item} now={now} onOpen={() => open(item.ref)} onChange={count => change(item, count)} />)}</div></section>;
          })}
          {!current.length && <div className="game-small-empty"><CalendarDays size={30} /><h3>今天没有周期事务</h3><p>可查看一周规划或新建事务。</p><button className="button secondary" onClick={() => setTab('week')}>看看一周安排</button></div>}
          {closed.length > 0 && <section className="game-section"><div className="game-section-title"><h2>其他指定星期事务<span>{closed.length}</span></h2><span>非执行日不计入今日待办</span></div><div className="game-closed-list">{closed.map(activity => <button key={activity.id} onClick={() => edit(activity)}><span>{activity.title}</span><small>{ruleLabel(activity, gaming.games.find(game => game.id === activity.gameId))}</small><Pencil size={14} /></button>)}</div></section>}
        </>}
        {tab === 'week' && <><div className="game-week-toolbar"><div><h2>{days[0].slice(5).replace('-', '/')} — {days[6].slice(5).replace('-', '/')}</h2><button className="today-button" onClick={() => setAnchor(today)}>本周</button><IconButton label="上一周周期计划" onClick={() => setAnchor(addDays(anchor, -7))}><ChevronLeft size={18} /></IconButton><IconButton label="下一周周期计划" onClick={() => setAnchor(addDays(anchor, 7))}><ChevronRight size={18} /></IconButton></div><span>本机时间 · 点击事务调整本期安排</span></div><div className="game-week-board">{days.map(day => {
          const items = week.filter(item => dateKey(item.plannedAt) === day);
          return <section key={day} className={`game-week-day ${day === today ? 'is-today' : ''}`}><header><span>周{WEEKDAYS[parseDate(day).getDay()]}</span><strong>{parseDate(day).getDate()}</strong>{day === today && <small>今天</small>}</header><div>{items.map(item => <button className={`game-week-card ${item.count >= item.activity.target ? 'done' : ''}`} style={accentStyle(item.game.color)} key={occurrenceKey(item.ref)} onClick={() => open(item.ref)}><span>{item.allDay ? '待安排' : localTime(item.plannedAt)}<small>{kindName(item.activity, item.game)}</small></span><strong>{item.activity.title}</strong><small>{item.game.name}</small><footer>{item.count >= item.activity.target ? <><Check size={13} />已完成</> : `${item.count}/${item.activity.target} 次 · ${item.activity.minutes * item.activity.target} 分钟`}</footer></button>)}{!items.length && <p className="game-week-empty">暂无安排</p>}</div></section>;
        })}</div><p className="game-hint game-week-note">每天和指定星期事务按执行日出现，每周、每月事务按计划日出现。游戏活动保留服务器刷新规则。</p></>}
        {tab === 'rules' && <><div className="game-management-heading"><h2>重复规则 <span>{activities.length}</span></h2><p>暂停会隐藏之后的安排，完成记录仍会保留。</p></div><div className="game-rule-list">{activities.map(activity => {
          const game = gaming.games.find(game => game.id === activity.gameId)!;
          return <div key={activity.id} className={`game-rule-row ${activity.paused ? 'paused' : ''}`} style={accentStyle(game.color)}><div className="game-avatar">{game.category === 'routine' ? <Repeat2 size={20} /> : <Gamepad2 size={20} />}</div><button className="game-rule-title" onClick={() => edit(activity)}><strong>{activity.title}{activity.paused && <small>已暂停</small>}</strong><span>{game.name} · {kindName(activity, game)} · {ruleLabel(activity, gaming.games.find(game => game.id === activity.gameId))}</span></button><span className="game-rule-schedule">{activity.kind === 'weekly' ? `周${WEEKDAYS[activity.planWeekday]} ` : activity.kind === 'monthly' ? `${activity.planMonthDay}日 ` : ''}{activity.timeWindow ? `${activity.timeWindow.earliest}–${activity.timeWindow.latest}` : activity.anytime ? '不限时间' : activity.planTime}<small>{activity.target} 次 / 期</small></span><IconButton label={`${activity.paused ? '恢复' : '暂停'}事务 ${activity.title}`} onClick={() => update(data => saveActivity(data, { ...activity, paused: !activity.paused }))}>{activity.paused ? <Play size={17} /> : <Pause size={17} />}</IconButton><IconButton label={`编辑事务 ${activity.title}`} onClick={() => edit(activity)}><Pencil size={16} /></IconButton></div>;
        })}</div>{!activities.length && <div className="game-small-empty"><h3>这个分组还没有事务</h3><button className="button secondary" onClick={create}>添加第一个事务</button></div>}</>}
      </div></> : <div className="game-welcome"><div className="game-welcome-art"><div /><Repeat2 size={62} strokeWidth={1.3} /><span><Gem size={21} /></span><i><Sparkles size={20} /></i></div><h2>暂无周期事务</h2><p>添加生活、学习、工作或游戏事务，按天、指定星期、周或月重复。</p><div className="game-feature-chips"><span><Gem size={16} />固定开放日</span><span><Check size={16} />周期目标</span><span><Clock3 size={16} />自定义刷新</span></div><div className="game-welcome-actions"><button className="button primary" onClick={create}><Plus size={16} />创建第一个事务</button><button className="button secondary" onClick={() => update(data => addGameExamples(data, now))}>载入游戏示例</button></div><small>示例为虚构活动，规则可自由修改。</small></div>}
    <footer className="game-footer"><span><Clock3 size={13} />普通事务按本机时间、游戏按服务器规则刷新 · 同步到日历</span></footer>
  </main>;
}

function ActivityCard({ item, now, onOpen, onChange }: { item: GameOccurrence; now: Date; onOpen: () => void; onChange: (count: number) => void }) {
  const { activity, game, count } = item, complete = count >= activity.target;
  const imminent = item.end.getTime() - now.getTime() < 6 * 3600000 && !complete;
  return <article className={`game-activity-card ${complete ? 'done' : ''}`} style={accentStyle(game.color)}>
    <button className="game-card-body" onClick={onOpen}><div className="game-card-kicker"><span><i />{game.name}</span><span className={`game-kind ${activity.kind}`}>{kindName(activity, game)}</span></div><h3>{activity.title}</h3><div className="game-card-meta"><span><Clock3 size={13} />{activity.minutes * activity.target} 分钟</span>{game.category !== 'routine' && activity.energy > 0 && <span><Zap size={13} />{activity.energy * Math.max(0, activity.target - count)} 体力待用</span>}<span>{friendlyDate(dateKey(item.plannedAt), dateKey(now))} {occurrenceTimeLabel(item)}</span></div>{activity.kind === 'material' && <div className="game-open-days">{[1, 2, 3, 4, 5, 6, 0].map(day => <span key={day} className={activity.weekdays.includes(day) ? 'open' : ''}>周{WEEKDAYS[day]}</span>)}</div>}</button>
    <div className="game-card-bottom"><span className={`game-countdown ${imminent ? 'urgent' : ''}`}>{complete ? '本期已完成' : remainingLabel(item.end, now)}</span><ProgressControls item={item} now={now} onChange={onChange} /></div><div className="game-card-progress"><div style={{ width: `${count / activity.target * 100}%` }} /></div>
  </article>;
}

export function RecurringToday({ data, now, update, onDialog, onManage }: { data: AppData; now: Date; update: DataUpdate; onDialog: (dialog: GameDialog) => void; onManage: () => void }) {
  const items = todayRoutines(data, now);
  if (!items.length) return <button className="routine-add-link" onClick={onManage}><Repeat2 size={15} />添加普通周期事务<Plus size={14} /></button>;
  return <section className="recurring-today"><div className="recurring-today-heading"><h3><Repeat2 size={16} />周期事务<span>{items.filter(item => item.count >= item.activity.target).length} / {items.length}</span></h3><button className="text-button" onClick={onManage}>管理周期事务</button></div>{items.length ? items.map(item => <div className={`routine-row ${item.count >= item.activity.target ? 'done' : ''}`} key={occurrenceKey(item.ref)} style={accentStyle(item.game.color)}><button className="routine-row-title" onClick={() => onDialog({ kind: 'occurrence', ref: item.ref })}><strong>{item.activity.title}</strong><span><i />{item.game.name} · {kindName(item.activity, item.game)} · {occurrenceTimeLabel(item)}</span></button><ProgressControls item={item} now={now} onChange={count => update(data => changeProgress(data, item.ref, count, new Date()))} /></div>) : <p className="routine-empty">暂无普通周期事务</p>}</section>;
}
