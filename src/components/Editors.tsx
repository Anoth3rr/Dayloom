import { useState } from 'react';
import { Bell, CalendarDays, Check, Clock3, Flag, Hash, ListTodo, Plus, Trash2, X } from 'lucide-react';
import type { AppData, Priority, Task, TaskList } from '../types';
import { COLORS, uid } from '../domain';
import { CheckButton, Confirm, IconButton, Modal } from './ui';

export function TaskEditor({ task, isNew, data, onSave, onDelete, onClose }: { task: Task; isNew: boolean; data: AppData; onSave: (task: Task) => void; onDelete: (id: string) => void; onClose: () => void }) {
  const [draft, setDraft] = useState<Task>(structuredClone(task));
  const [subTitle, setSubTitle] = useState('');
  const [confirm, setConfirm] = useState(false);
  const patch = (value: Partial<Task>) => setDraft(current => ({ ...current, ...value }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(task) || !!subTitle.trim();
  function close() { if (dirty) setConfirm(true); else onClose(); }
  function addSub() {
    if (!subTitle.trim() || draft.subtasks.length >= 100) return;
    patch({ subtasks: [...draft.subtasks, { id: uid(), title: subTitle.trim(), completed: false }] }); setSubTitle('');
  }
  function save() {
    if (!draft.title.trim()) return;
    const subtasks = subTitle.trim() && draft.subtasks.length < 100 ? [...draft.subtasks, { id: uid(), title: subTitle.trim(), completed: false }] : draft.subtasks;
    onSave({ ...draft, title: draft.title.trim(), subtasks, example: false });
  }
  return <><Modal title={isNew ? '给想法一个位置' : '任务详情'} description={isNew ? '从一件小事开始，让今天更有序。' : '安排好时间，然后专注地去做。'} onClose={close} className="drawer"><form className="editor-form" onSubmit={event => { event.preventDefault(); save(); }} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); event.currentTarget.requestSubmit(); } }}>
    <div className="editor-scroll"><div className="editor-title"><CheckButton label="任务完成状态" checked={draft.completed} onChange={() => patch({ completed: !draft.completed, completedAt: !draft.completed ? new Date().toISOString() : null })} priority={draft.priority} /><textarea data-autofocus aria-label="任务名称" placeholder="想做些什么？" rows={2} maxLength={300} required value={draft.title} onChange={event => patch({ title: event.target.value })} /></div>
      <div className="editor-properties"><label className="property-row"><span><Hash size={15} />所属清单</span><select aria-label="所属清单" value={draft.listId} onChange={event => patch({ listId: event.target.value })}>{data.lists.map(list => <option key={list.id} value={list.id}>{list.name}</option>)}</select></label>
      <label className="property-row"><span><CalendarDays size={15} />计划日期</span><input aria-label="计划日期" type="date" min="1900-01-01" max="2199-12-31" value={draft.date || ''} onChange={event => patch({ date: event.target.value || null, ...(!event.target.value ? { time: null, reminder: false } : {}) })} /></label>
      <label className="property-row"><span><Clock3 size={15} />开始时间</span><input aria-label="开始时间" type="time" disabled={!draft.date} value={draft.time || ''} onChange={event => patch({ time: event.target.value || null, ...(!event.target.value ? { reminder: false } : {}) })} /></label>
      {draft.time && <label className="property-row"><span><Clock3 size={15} />预计时长</span><div className="duration-input"><input aria-label="预计时长" type="number" min={5} max={1440} step={5} required value={draft.duration} onChange={event => patch({ duration: Number(event.target.value) })} /><span>分钟</span></div></label>}
      <label className="property-row"><span><Flag size={15} />优先级</span><select aria-label="优先级" value={draft.priority} onChange={event => patch({ priority: Number(event.target.value) as Priority })}><option value={0}>无优先级</option><option value={3}>高优先级</option><option value={2}>中优先级</option><option value={1}>低优先级</option></select></label>
      <label className="property-row"><span><Bell size={15} />到点提醒</span><input className="switch" aria-label="到点提醒" type="checkbox" checked={draft.reminder} disabled={!draft.date || !draft.time || !window.desktop} onChange={event => patch({ reminder: event.target.checked })} /></label><p className="property-hint">{window.desktop ? '设置日期和时间后，可在应用运行时收到桌面通知。' : '桌面版支持到点提醒，网页预览中暂不可用。'}</p></div>
      <div className="subtasks-section"><h3><ListTodo size={15} />拆成几个小步骤<span>{draft.subtasks.filter(sub => sub.completed).length}/{draft.subtasks.length}</span></h3>{draft.subtasks.map(sub => <div className="subtask-row" key={sub.id}><CheckButton checked={sub.completed} label={`子任务 ${sub.title}`} onChange={() => patch({ subtasks: draft.subtasks.map(item => item.id === sub.id ? { ...item, completed: !item.completed } : item) })} /><input aria-label={`子任务名称 ${sub.title}`} value={sub.title} required maxLength={300} onChange={event => patch({ subtasks: draft.subtasks.map(item => item.id === sub.id ? { ...item, title: event.target.value } : item) })} className={sub.completed ? 'done-text' : ''} /><IconButton label={`删除子任务 ${sub.title}`} onClick={() => patch({ subtasks: draft.subtasks.filter(item => item.id !== sub.id) })}><X size={14} /></IconButton></div>)}<div className="add-subtask"><Plus size={15} /><input aria-label="添加子任务" placeholder="添加一个小步骤…" value={subTitle} maxLength={300} onChange={event => setSubTitle(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.ctrlKey) { event.preventDefault(); addSub(); } }} /><IconButton label="确认添加子任务" disabled={!subTitle.trim() || draft.subtasks.length >= 100} onClick={addSub}><Check size={15} /></IconButton></div></div>
      <label className="notes-label">备注<textarea aria-label="任务备注" maxLength={10000} placeholder="记下灵感、细节，或者一个小小的提醒…" value={draft.notes} onChange={event => patch({ notes: event.target.value })} rows={5} /></label>
    </div><div className="editor-footer">{!isNew && <IconButton label="删除任务" className="delete-button" onClick={() => onDelete(task.id)}><Trash2 size={17} /></IconButton>}<span>{dirty ? '有未保存的更改' : '一点一滴，慢慢完成'}</span><button type="submit" className="button primary">{isNew ? '创建任务' : '保存更改'}</button></div>
  </form></Modal>{confirm && <Confirm title="放弃未保存的更改？" description="本次编辑尚未保存，离开后将恢复之前的内容。" action="放弃更改" onClose={() => setConfirm(false)} onConfirm={onClose} />}</>;
}

export function ListEditor({ list, data, onSave, onDelete, onClose }: { list?: TaskList; data: AppData; onSave: (list: TaskList) => void; onDelete: (id: string) => void; onClose: () => void }) {
  const [name, setName] = useState(list?.name || '');
  const [color, setColor] = useState(list?.color || COLORS[0]);
  const [confirm, setConfirm] = useState(false);
  const duplicate = data.lists.some(item => item.name === name.trim() && item.id !== list?.id);
  return <><Modal title={list ? '编辑清单' : '创建一个清单'} description="给生活的不同侧面，留一个专属位置。" onClose={onClose} className="list-modal"><form onSubmit={event => { event.preventDefault(); if (name.trim() && !duplicate) onSave({ id: list?.id || uid(), name: name.trim(), color }); }}><label className="form-label">清单名称<input data-autofocus placeholder="例如：工作、旅行、灵感…" aria-label="清单名称" value={name} maxLength={40} required onChange={event => setName(event.target.value)} /></label>{duplicate && <p className="field-error">已经有同名清单了，换个名字吧。</p>}<div className="form-label">清单颜色<div className="color-choices">{COLORS.map((item, i) => <button type="button" key={item} aria-label={['蓝色', '绿色', '紫色', '橙色', '粉色', '灰蓝色'][i]} aria-pressed={color === item} style={{ background: item }} onClick={() => setColor(item)}>{color === item && <Check size={18} />}</button>)}</div></div><div className="modal-actions">{list && <button type="button" className="button text-danger" onClick={() => setConfirm(true)}><Trash2 size={15} />删除清单</button>}<button type="submit" className="button primary" disabled={!name.trim() || duplicate || (!list && data.lists.length >= 100)}>{list ? '保存清单' : '创建清单'}</button></div></form></Modal>{confirm && <Confirm title="删除这个清单？" description="清单中的任务会移回收集箱，任务内容会保留。" action="删除清单" danger onClose={() => setConfirm(false)} onConfirm={() => onDelete(list!.id)} />}</>;
}
