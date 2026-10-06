import { useEffect, useRef, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react';
import { Check, X } from 'lucide-react';

export const accentStyle = (color: string): CSSProperties => ({ '--item-color': color } as CSSProperties);
export function IconButton({ label, children, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button type="button" className={`icon-button ${className}`} aria-label={label} title={label} {...props}>{children}</button>;
}
export function CheckButton({ checked, onChange, label, priority = 0 }: { checked: boolean; onChange: () => void; label: string; priority?: number }) {
  return <button type="button" role="checkbox" aria-checked={checked} aria-label={label} className={`task-check priority-${priority} ${checked ? 'checked' : ''}`} onClick={onChange}>{checked && <Check size={12} strokeWidth={2.7} />}</button>;
}
export function Modal({ title, children, onClose, className = '', description }: { title: string; children: ReactNode; onClose: () => void; className?: string; description?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const timer = window.setTimeout(() => {
      const target = ref.current?.querySelector<HTMLElement>('[data-autofocus], input, textarea, select, button');
      target?.focus({ preventScroll: true });
    }, 30);
    const key = (event: KeyboardEvent) => {
      const dialogs = document.querySelectorAll('[role="dialog"]');
      if (dialogs[dialogs.length - 1] !== ref.current) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close.current(); }
      if (event.key !== 'Tab') return;
      const nodes = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]') || []).filter(el => el.getClientRects().length > 0);
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && (document.activeElement === first || !ref.current?.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', key);
    return () => { clearTimeout(timer); document.removeEventListener('keydown', key); previous?.focus({ preventScroll: true }); };
  }, []);
  return <div className={`modal-backdrop ${className.includes('drawer') ? 'drawer-backdrop' : ''}`} onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className={`modal ${className}`}>
      <div className="modal-heading"><div><h2>{title}</h2>{description && <p>{description}</p>}</div><IconButton label="关闭弹窗" onClick={onClose}><X size={19} /></IconButton></div>
      {children}
    </div>
  </div>;
}
export function Confirm({ title, description, action = '确认', onConfirm, onClose, danger = false }: { title: string; description: string; action?: string; onConfirm: () => void; onClose: () => void; danger?: boolean }) {
  return <Modal title={title} onClose={onClose} className="confirm-modal"><p className="confirm-description">{description}</p><div className="modal-actions"><button className="button secondary" onClick={onClose}>取消</button><button className={`button ${danger ? 'danger' : 'primary'}`} onClick={onConfirm}>{action}</button></div></Modal>;
}
