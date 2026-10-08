import { useState } from 'react';
import { Check, Download, FolderOpen, HardDrive, Laptop, Moon, Sun, Upload } from 'lucide-react';
import type { AppData, Theme } from '../types';
import { exportData, importData } from '../storage';
import { Confirm, Modal } from './ui';
import { AccountPanel } from './AccountPanel';
import type { WorkspaceState } from '../account-types';
import type { WorkspaceController } from '../workspace';

export function Settings({ data, path, onChange, onClose, notify, controller, workspaceState }: { data: AppData; path: string; onChange: (data: AppData) => void; onClose: () => void; notify: (message: string) => void; controller: WorkspaceController; workspaceState: WorkspaceState }) {
  const [pending, setPending] = useState<AppData | null>(null);
  const [clear, setClear] = useState(false);
  const [busy, setBusy] = useState(false);
  const exampleCount = data.tasks.filter(task => task.example).length;
  async function backup() { setBusy(true); try { if (await exportData(data)) notify('备份已导出'); } catch (error) { notify(`导出失败：${error instanceof Error ? error.message : error}`); } finally { setBusy(false); } }
  async function restore() { setBusy(true); try { setPending(await importData()); } catch (error) { notify(`无法导入：${error instanceof Error ? error.message : error}`); } finally { setBusy(false); } }
  function theme(value: Theme) { onChange({ ...data, settings: { ...data.settings, theme: value } }); }
  return <><Modal title="设置" onClose={onClose} className="settings-modal"><div className="settings-scroll"><AccountPanel controller={controller} state={workspaceState} /><section className="settings-section"><h3>外观</h3><div className="theme-choices">{[{ value: 'light', name: '浅色', icon: Sun }, { value: 'dark', name: '深色', icon: Moon }, { value: 'system', name: '跟随系统', icon: Laptop }].map(({ value, name, icon: Icon }) => <button key={value} aria-pressed={data.settings.theme === value} className={data.settings.theme === value ? 'selected' : ''} onClick={() => theme(value as Theme)}><div className={`theme-preview theme-${value}`}><span /><span /><span /></div><span><Icon size={14} />{name}{data.settings.theme === value && <Check size={14} />}</span></button>)}</div><div className="glass-setting"><div><strong>磨砂浓度</strong><span>调整背景透明度。</span></div><b>{data.settings.glass}%</b></div><input aria-label="磨砂浓度" className="glass-range" type="range" min={55} max={100} step={1} value={data.settings.glass} onChange={event => onChange({ ...data, settings: { ...data.settings, glass: Number(event.target.value) } })} /><div className="range-labels"><span>更通透</span><span>更柔和</span></div></section>
    <section className="settings-section"><h3>数据与备份</h3><div className="storage-info"><HardDrive size={20} /><div><strong>{workspaceState.session ? '当前账号的本机缓存' : '本机任务'}</strong><p>{workspaceState.session ? '离线修改会保存在本机，联网后自动同步。' : '可离线使用；登录后可选择合并本机任务并跨设备同步。'}</p><span title={path}>{path}</span></div></div><div className="backup-buttons"><button className="button secondary" disabled={busy} onClick={backup}><Download size={15} />导出备份</button><button className="button secondary" disabled={busy} onClick={restore}><Upload size={15} />导入备份</button>{window.desktop && <button className="button secondary" onClick={() => window.desktop?.showDataFolder()}><FolderOpen size={15} />数据目录</button>}</div>{exampleCount > 0 && <div className="example-setting"><span>当前还有 {exampleCount} 个示例任务</span><button className="text-button" onClick={() => setClear(true)}>清除示例</button></div>}</section>
    <section className="settings-section shortcuts"><h3>快捷键</h3><div><span>搜索全部任务</span><span><kbd>Ctrl</kbd> + <kbd>K</kbd></span></div><div><span>新建任务</span><span><kbd>Ctrl</kbd> + <kbd>N</kbd></span></div><div><span>保存任务编辑</span><span><kbd>Ctrl</kbd> + <kbd>Enter</kbd></span></div><div><span>关闭面板</span><kbd>Esc</kbd></div></section><div className="settings-about"><span className="mini-brand">拾序</span><span>1.4.0</span></div></div></Modal>
    {pending && <Confirm title="用备份恢复数据？" description={`这份备份包含 ${pending.tasks.length} 个任务、${pending.lists.length - 1} 个清单、${pending.gaming?.games.length || 0} 个分组和 ${pending.gaming?.activities.length || 0} 项周期事务，将替换当前全部记录。建议先导出当前数据。`} action="恢复备份" onClose={() => setPending(null)} onConfirm={() => { onChange(pending); setPending(null); notify('备份已恢复'); }} />}
    {clear && <Confirm title="清除示例任务？" description="仅清除未修改过的示例，你自己创建或修改的任务会保留。" action="清除示例" onClose={() => setClear(false)} onConfirm={() => { onChange({ ...data, tasks: data.tasks.filter(task => !task.example) }); setClear(false); notify('示例任务已清除'); }} />}
  </>;
}
