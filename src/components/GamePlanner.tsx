import { useState } from 'react';
import { CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, Gamepad2, Gem, Pause, Pencil, Play, Plus, Settings2, Sparkles, Zap } from 'lucide-react';
import { addDays, dateKey, friendlyDate, parseDate, startOfWeek, WEEKDAYS } from '../domain';
import { addGameExamples, changeProgress, currentOccurrences, gameDay, gamingData, KIND_NAMES, localTime, newActivity, occurrenceKey, occurrencesInRange, remainingLabel, ruleLabel, saveActivity, zoneLabel } from '../gaming';
import type { GameOccurrence, OccurrenceRef } from '../gaming';
import type { AppData, GameActivity } from '../types';
import { accentStyle, IconButton } from './ui';
import { ProgressControls } from './GameEditors';
import type { DataUpdate, GameDialog } from './GameEditors';

export function GamePlanner({ data, now, update, onDialog }: { data: AppData; now: Date; update: DataUpdate; onDialog: (dialog: GameDialog) => void }) {
  const [tab, setTab] = useState<'today' | 'week' | 'rules'>('today');
  const [filter, setFilter] = useState('all');
  const [anchor, setAnchor] = useState(dateKey(now));
  const gaming = gamingData(data), today = dateKey(now);
  const selected = gaming.games.some(game => game.id === filter) ? filter : 'all';
  const games = gaming.games.filter(game => selected === 'all' || game.id === selected);
  const activities = gaming.activities.filter(activity => selected === 'all' || activity.gameId === selected);
  const current = currentOccurrences(data, now).filter(item => selected === 'all' || item.game.id === selected);
  const pending = current.filter(item => item.count < item.activity.target);
  const weekStart = startOfWeek(anchor), days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const week = occurrencesInRange(data, days[0], days[6]).filter(item => selected === 'all' || item.game.id === selected);
  const todayPlan = pending.filter(item => item.activity.kind === 'daily' || item.activity.kind === 'material' || dateKey(item.plannedAt) === today);
  const plannedMinutes = todayPlan.reduce((sum, item) => sum + (item.activity.target - item.count) * item.activity.minutes, 0);
  function create() {
    const game = games[0];
    onDialog(game ? { kind: 'activity', activity: newActivity(game, now), isNew: true } : { kind: 'game', addAfter: true });
  }
  const open = (ref: OccurrenceRef) => onDialog({ kind: 'occurrence', ref });
  const edit = (activity: GameActivity) => onDialog({ kind: 'activity', activity, isNew: false });
  const change = (item: GameOccurrence, count: number) => update(data => changeProgress(data, item.ref, count, new Date()));
  const closed = activities.filter(activity => !activity.paused && activity.kind === 'material' && !current.some(item => item.activity.id === activity.id));
  return <main className="game-main">
    <header className="page-header"><div><h1>游戏日程 <Gamepad2 size={26} strokeWidth={1.6} /></h1></div><button className="button primary" onClick={create}><Plus size={17} />新建活动</button></header>
    <div className="game-topbar"><div className="game-filters" aria-label="筛选游戏"><button className={selected === 'all' ? 'selected' : ''} onClick={() => setFilter('all')}>全部游戏</button>{gaming.games.map(game => <button key={game.id} className={selected === game.id ? 'selected' : ''} style={accentStyle(game.color)} onClick={() => setFilter(game.id)}><i />{game.name}</button>)}</div><button className="game-settings-button" onClick={() => onDialog({ kind: 'games' })}><Settings2 size={16} />管理游戏</button></div>
    {gaming.activities.length ? <><div className="game-tabs" role="tablist" aria-label="游戏日程视图">{([['today', '今日待办'], ['week', '一周规划'], ['rules', '活动管理']] as const).map(([id, title]) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'selected' : ''} onClick={() => setTab(id)}>{title}</button>)}</div>
      <div className={`game-scroll ${tab === 'week' ? 'game-week-scroll' : ''}`}>
        {tab === 'today' && <>
          <div className="game-overview"><div className="game-overview-icon"><Gamepad2 size={29} strokeWidth={1.5} /></div><div><h2>{current.length ? '本期进度' : '暂无开放活动'}</h2><p>{pending.length ? `当前还有 ${pending.length} 项目标，今天计划约 ${plannedMinutes} 分钟。` : current.length ? '本期目标已全部完成。' : '可在一周规划中查看后续活动。'}</p></div><div className="game-overview-progress"><strong>{current.length - pending.length}<span> / {current.length}</span></strong><small>本期已完成</small></div></div>
          <div className="game-reset-strip">{games.map(game => <span key={game.id} style={accentStyle(game.color)}><i /><strong>{game.name}</strong><span>游戏日 {gameDay(game, now).slice(5).replace('-', '/')} · {game.resetTime} 刷新 · {zoneLabel(game.utcOffset)}</span></span>)}</div>
          {(['today', 'weekly', 'monthly'] as const).map(group => {
            const items = current.filter(item => group === 'today' ? ['material', 'daily'].includes(item.activity.kind) : item.activity.kind === group).sort((a, b) => Number(a.count >= a.activity.target) - Number(b.count >= b.activity.target) || a.plannedAt.getTime() - b.plannedAt.getTime());
            if (!items.length) return null;
            return <section className="game-section" key={group}><div className="game-section-title"><h2>{group === 'today' ? <Gem size={17} /> : <CalendarDays size={17} />}{group === 'today' ? '今日开放与日常' : group === 'weekly' ? '本周目标' : '本月目标'}<span>{items.length}</span></h2><span>{group === 'today' ? '开放日内完成，刷新后重新计数' : '周期内完成即可，无需每天重复'}</span></div><div className="game-card-grid">{items.map(item => <ActivityCard key={occurrenceKey(item.ref)} item={item} now={now} onOpen={() => open(item.ref)} onChange={count => change(item, count)} />)}</div></section>;
          })}
          {!current.length && <div className="game-small-empty"><CalendarDays size={30} /><h3>今天没有开放中的活动</h3><p>可以查看一周规划，或添加新的日常目标。</p><button className="button secondary" onClick={() => setTab('week')}>看看一周安排</button></div>}
          {closed.length > 0 && <section className="game-section"><div className="game-section-title"><h2>其他材料本<span>{closed.length}</span></h2><span>未开放的活动不会计入今日待办</span></div><div className="game-closed-list">{closed.map(activity => <button key={activity.id} onClick={() => edit(activity)}><span>{activity.title}</span><small>{ruleLabel(activity)}</small><Pencil size={14} /></button>)}</div></section>}
        </>}
        {tab === 'week' && <><div className="game-week-toolbar"><div><h2>{days[0].slice(5).replace('-', '/')} — {days[6].slice(5).replace('-', '/')}</h2><button className="today-button" onClick={() => setAnchor(today)}>本周</button><IconButton label="上一周游戏计划" onClick={() => setAnchor(addDays(anchor, -7))}><ChevronLeft size={18} /></IconButton><IconButton label="下一周游戏计划" onClick={() => setAnchor(addDays(anchor, 7))}><ChevronRight size={18} /></IconButton></div><span>本机时间 · 点击活动调整本期安排</span></div><div className="game-week-board">{days.map(day => {
          const items = week.filter(item => dateKey(item.plannedAt) === day);
          return <section key={day} className={`game-week-day ${day === today ? 'is-today' : ''}`}><header><span>周{WEEKDAYS[parseDate(day).getDay()]}</span><strong>{parseDate(day).getDate()}</strong>{day === today && <small>今天</small>}</header><div>{items.map(item => <button className={`game-week-card ${item.count >= item.activity.target ? 'done' : ''}`} style={accentStyle(item.game.color)} key={occurrenceKey(item.ref)} onClick={() => open(item.ref)}><span>{item.allDay ? '全天' : localTime(item.plannedAt)}<small>{KIND_NAMES[item.activity.kind]}</small></span><strong>{item.activity.title}</strong><small>{item.game.name}</small><footer>{item.count >= item.activity.target ? <><Check size={13} />已完成</> : `${item.count}/${item.activity.target} 次 · ${item.activity.minutes * item.activity.target} 分钟`}</footer></button>)}{!items.length && <p className="game-week-empty">暂无安排</p>}</div></section>;
        })}</div><p className="game-hint game-week-note">日常和材料本按开放日出现；周常、月常按计划日出现。凌晨刷新前，可能仍属于前一个游戏日。</p></>}
        {tab === 'rules' && <><div className="game-management-heading"><h2>活动规则 <span>{activities.length}</span></h2><p>暂停会隐藏之后的安排，完成记录仍会保留。</p></div><div className="game-rule-list">{activities.map(activity => {
          const game = gaming.games.find(game => game.id === activity.gameId)!;
          return <div key={activity.id} className={`game-rule-row ${activity.paused ? 'paused' : ''}`} style={accentStyle(game.color)}><div className="game-avatar"><Gamepad2 size={20} /></div><button className="game-rule-title" onClick={() => edit(activity)}><strong>{activity.title}{activity.paused && <small>已暂停</small>}</strong><span>{game.name} · {KIND_NAMES[activity.kind]} · {ruleLabel(activity)}</span></button><span className="game-rule-schedule">{activity.kind === 'weekly' ? `周${WEEKDAYS[activity.planWeekday]} ` : activity.kind === 'monthly' ? `${activity.planMonthDay}日 ` : ''}{activity.planTime}<small>{activity.target} 次 / 期</small></span><IconButton label={`${activity.paused ? '恢复' : '暂停'}活动 ${activity.title}`} onClick={() => update(data => saveActivity(data, { ...activity, paused: !activity.paused }))}>{activity.paused ? <Play size={17} /> : <Pause size={17} />}</IconButton><IconButton label={`编辑活动 ${activity.title}`} onClick={() => edit(activity)}><Pencil size={16} /></IconButton></div>;
        })}</div>{!activities.length && <div className="game-small-empty"><h3>这个游戏还没有活动</h3><button className="button secondary" onClick={create}>添加第一个活动</button></div>}</>}
      </div></> : <div className="game-welcome"><div className="game-welcome-art"><div /><Gamepad2 size={62} strokeWidth={1.3} /><span><Gem size={21} /></span><i><Sparkles size={20} /></i></div><h2>暂无游戏活动</h2><p>添加材料本、日常、周常或月常，设置开放日和刷新规则。</p><div className="game-feature-chips"><span><Gem size={16} />固定开放日</span><span><Check size={16} />周期目标</span><span><Clock3 size={16} />自定义刷新</span></div><div className="game-welcome-actions"><button className="button primary" onClick={create}><Plus size={16} />创建第一个活动</button><button className="button secondary" onClick={() => update(data => addGameExamples(data, now))}>载入通用示例</button></div><small>示例为虚构活动，规则可自由修改。</small></div>}
    <footer className="game-footer"><span><Clock3 size={13} />按游戏服务器时间刷新，计划同步到日历</span></footer>
  </main>;
}

function ActivityCard({ item, now, onOpen, onChange }: { item: GameOccurrence; now: Date; onOpen: () => void; onChange: (count: number) => void }) {
  const { activity, game, count } = item, complete = count >= activity.target;
  const imminent = item.end.getTime() - now.getTime() < 6 * 3600000 && !complete;
  return <article className={`game-activity-card ${complete ? 'done' : ''}`} style={accentStyle(game.color)}>
    <button className="game-card-body" onClick={onOpen}><div className="game-card-kicker"><span><i />{game.name}</span><span className={`game-kind ${activity.kind}`}>{KIND_NAMES[activity.kind]}</span></div><h3>{activity.title}</h3><div className="game-card-meta"><span><Clock3 size={13} />{activity.minutes * activity.target} 分钟</span>{activity.energy > 0 && <span><Zap size={13} />{activity.energy * Math.max(0, activity.target - count)} 体力待用</span>}<span>{friendlyDate(dateKey(item.plannedAt), dateKey(now))} {item.allDay ? '全天' : localTime(item.plannedAt)}</span></div>{activity.kind === 'material' && <div className="game-open-days">{[1, 2, 3, 4, 5, 6, 0].map(day => <span key={day} className={activity.weekdays.includes(day) ? 'open' : ''}>周{WEEKDAYS[day]}</span>)}</div>}</button>
    <div className="game-card-bottom"><span className={`game-countdown ${imminent ? 'urgent' : ''}`}>{complete ? '本期已完成' : remainingLabel(item.end, now)}</span><ProgressControls item={item} now={now} onChange={onChange} /></div><div className="game-card-progress"><div style={{ width: `${count / activity.target * 100}%` }} /></div>
  </article>;
}
