import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, X } from 'lucide-react';

/** Bottom sheet modal. */
export function Sheet({ open, onClose, title, children, footer, tall = false }: {
  open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; footer?: ReactNode; tall?: boolean;
}) {
  const { t } = useTranslation();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true">
      <div className="animate-fade absolute inset-0 bg-black/40" onClick={onClose} />
      <div className={`animate-sheet relative flex w-full max-w-md flex-col rounded-t-3xl bg-page shadow-2xl ${tall ? 'h-[94dvh]' : 'max-h-[94dvh]'}`}>
        <div className="flex items-center gap-2 px-4 pb-2 pt-3">
          <div className="min-w-0 flex-1 truncate text-lg font-bold">{title}</div>
          <button className="btn-ghost size-11 min-h-11 rounded-full p-0" onClick={onClose} aria-label={t('common.close')}>
            <X className="size-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{children}</div>
        {footer && <div className="safe-bottom border-t border-line bg-page px-4 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function PageHeader({ title, back = false, actions }: { title: ReactNode; back?: boolean; actions?: ReactNode }) {
  const nav = useNavigate();
  const { t } = useTranslation();
  return (
    <header className="sticky top-0 z-20 flex min-h-14 items-center gap-1 bg-page/90 px-2 backdrop-blur">
      {back && (
        <button className="btn-ghost size-11 min-h-11 rounded-full p-0" onClick={() => nav(-1)} aria-label={t('common.back')}>
          <ArrowLeft className="size-5 rtl:rotate-180" />
        </button>
      )}
      <h1 className={`min-w-0 flex-1 truncate text-xl font-bold ${back ? '' : 'px-2'}`}>{title}</h1>
      {actions}
    </header>
  );
}

export function Segmented<T extends string>({ value, options, onChange, size = 'md' }: {
  value: T; options: Array<{ value: T; label: ReactNode }>; onChange: (v: T) => void; size?: 'sm' | 'md';
}) {
  return (
    <div className="flex rounded-xl bg-black/5 p-1 dark:bg-white/5" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-lg px-2 font-semibold transition ${size === 'sm' ? 'min-h-9 text-sm' : 'min-h-11'} ${
            o.value === value ? 'bg-surface text-ink shadow-sm' : 'text-muted'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Empty({ icon, title, hint, action }: { icon?: ReactNode; title: ReactNode; hint?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      {icon && <div className="text-muted/60">{icon}</div>}
      <p className="font-semibold">{title}</p>
      {hint && <p className="text-sm text-muted">{hint}</p>}
      {action}
    </div>
  );
}

export function Row({ children, onClick, className = '' }: { children: ReactNode; onClick?: () => void; className?: string }) {
  const cls = `flex min-h-14 w-full items-center gap-3 px-4 py-2 text-start ${onClick ? 'active:bg-black/5 dark:active:bg-white/5' : ''} ${className}`;
  return onClick ? <button className={cls} onClick={onClick}>{children}</button> : <div className={cls}>{children}</div>;
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition ${checked ? 'bg-teal-600' : 'bg-black/20 dark:bg-white/20'}`}
    >
      <span className={`absolute top-1 size-5 rounded-full bg-white shadow transition-all ${checked ? 'start-6' : 'start-1'}`} />
    </button>
  );
}

export function Money({ value, className = '', sign = false, fmt }: {
  value: number; className?: string; sign?: boolean; fmt: { money: (v: number, o?: { sign?: boolean }) => string };
}) {
  return <span className={`num ${className}`}>{fmt.money(value, { sign })}</span>;
}
