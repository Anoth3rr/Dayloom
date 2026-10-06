import { useState } from 'react';
import { Check, Download, FolderOpen, HardDrive, Laptop, Moon, Sun, Upload } from 'lucide-react';
import type { AppData, Theme } from '../types';
import { exportData, importData } from '../storage';
import { Confirm, Modal } from './ui';

export function Settings({ data, path, onChange, onClose, notify }: { data: AppData; path: string; onChange: (data: AppData) => void; onClose: () => void; notify: (message: string) => void }) {
  const [pending, setPending] = useState<AppData | null>(null);
  const [clear, setClear] = useState(false);
  const [busy, setBusy] = useState(false);
  const exampleCount = data.tasks.filter(task => task.example).length;
  async function backup() { setBusy(true); try { if (await exportData(data)) notify('备份已导出'); } catch (error) { notify(`导出失败：${error instanceof Error ? error.message : error}`); } finally { setBusy(false); } }
  async function restore() { setBusy(true); try { setPending(await importData()); } catch (error) { notify(`无法导入：${error instanceof Error ? error.message : error}`); } finally { setBusy(false); } }
  function theme(value: Theme) { onChange({ ...data, settings: { ...data.settings, theme: value } }); }
  return <><Modal title="让拾序，更像你的空间" description="一点偏好，让每天的记录更舒服。" onClose={onClose} className="settings-modal"><div className="settings-scroll"><section className="settings-section"><h3>外观</h3><div className="theme-choices">{[{ value: 'light', name: '浅色', icon: Sun }, { value: 'dark', name: '深色', icon: Moon }, { value: 'system', name: '跟随系统', icon: Laptop }].map(({ value, name, icon: Icon }) => <button key={value} aria-pressed={data.settings.theme === value} className={data.settings.theme === value ? 'selected' : ''} onClick={() => theme(value as Theme)}><div className={`theme-preview theme-${value}`}><span /><span /><span /></div><span><Icon size={14} />{name}{data.settings.theme === value && <Check size={14} />}</span></button>)}</div><div className="glass-setting"><div><strong>磨砂浓度</strong><span>轻盈通透与清晰阅读之间，找到你的平衡。</span></div><b>{data.settings.glass}%</b></div><input aria-label="磨砂浓度" className="glass-range" type="range" min={55} max={100} step={1} value={data.settings.glass} onChange={event => onChange({ ...data, settings: { ...data.settings, glass: Number(event.target.value) } })} /><div className="range-labels"><span>更通透</span><span>更柔和</span></div></section>
    <section className="settings-section"><h3>数据与备份</h3><div className="storage-info"><HardDrive size={20} /><div><strong>所有记录，都在你身边</strong><p>数据保存在本地，无需账号。建议定期导出备份。</p><span title={path}>{path}</span></div></div><div className="backup-buttons"><button className="button secondary" disabled={busy} onClick={backup}><Download size={15} />导出备份</button><button className="button secondary" disabled={busy} onClick={restore}><Upload size={15} />导入备份</button>{window.desktop && <button className="button secondary" onClick={() => window.desktop?.showDataFolder()}><FolderOpen size={15} />数据目录</button>}</div>{exampleCount > 0 && <div className="example-setting"><span>当前还有 {exampleCount} 个示例任务</span><button className="text-button" onClick={() => setClear(true)}>清除示例</button></div>}</section>
    <section className="settings-section shortcuts"><h3>顺手一点</h3><div><span>搜索全部任务</span><span><kbd>Ctrl</kbd> + <kbd>K</kbd></span></div><div><span>新建任务</span><span><kbd>Ctrl</kbd> + <kbd>N</kbd></span></div><div><span>保存任务编辑</span><span><kbd>Ctrl</kbd> + <kbd>Enter</kbd></span></div><div><span>关闭面板</span><kbd>Esc</kbd></div></section><div className="settings-about"><span className="mini-brand">拾序</span><span>1.0.0 · 把日子过得有序</span></div></div></Modal>
    {pending && <Confirm title="用备份恢复数据？" description={`这份备份包含 ${pending.tasks.length} 个任务、${pending.lists.length - 1} 个清单，将替换当前记录。建议先导出当前数据。`} action="恢复备份" onClose={() => setPending(null)} onConfirm={() => { onChange(pending); setPending(null); notify('备份已恢复'); }} />}
    {clear && <Confirm title="清除示例任务？" description="仅清除未修改过的示例，你自己创建或修改的任务会保留。" action="清除示例" onClose={() => setClear(false)} onConfirm={() => { onChange({ ...data, tasks: data.tasks.filter(task => !task.example) }); setClear(false); notify('示例已清除，从你的第一件小事开始吧'); }} />}
  </>;
}
