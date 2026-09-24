// Custom date/time pickers. Native <input type="date"> follows the phone's language and may show
// Eastern Arabic digits; these always render Latin digits (0-9) through our own formatters.
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  addDays, addMonths, format, isSameDay, isSameMonth, startOfDay, startOfMonth, startOfWeek,
} from 'date-fns';
import { CalendarDays, ChevronLeft, ChevronRight, Clock, X } from 'lucide-react';
import { Sheet } from './ui';
import { useFmt } from '../hooks/fmt';
import { useSettings } from '../hooks/settings';

const pad = (n: number) => String(n).padStart(2, '0');

function Calendar({ value, onPick, min, max }: { value: number | null; onPick: (day: number) => void; min?: number; max?: number }) {
  const { t } = useTranslation();
  const fmt = useFmt();
  const { weekStartsOn } = useSettings();
  const [view, setView] = useState(() => startOfMonth(value ?? Date.now()));
  const days = useMemo(() => {
    const first = startOfWeek(view, { weekStartsOn });
    return Array.from({ length: 42 }, (_, i) => addDays(first, i));
  }, [view, weekStartsOn]);
  const weeks = isSameMonth(days[35], view) ? 6 : 5;
  const today = new Date();

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <button type="button" className="btn-ghost size-11 min-h-11 rounded-full p-0" onClick={() => setView(addMonths(view, -1))} aria-label={t('period.previous')}>
          <ChevronLeft className="size-5 rtl:rotate-180" />
        </button>
        <span className="flex-1 text-center text-lg font-bold">{fmt.date(+view, 'monthYear')}</span>
        <button type="button" className="btn-ghost size-11 min-h-11 rounded-full p-0" onClick={() => setView(addMonths(view, 1))} aria-label={t('period.next')}>
          <ChevronRight className="size-5 rtl:rotate-180" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {days.slice(0, 7).map((d) => (
          <span key={+d} className="pb-1 text-xs font-semibold text-muted">{fmt.date(+d, 'weekday')}</span>
        ))}
        {days.slice(0, weeks * 7).map((d) => {
          const out = (min != null && +d < startOfDay(min).getTime()) || (max != null && +d > startOfDay(max).getTime());
          const selected = value != null && isSameDay(d, value);
          return (
            <button
              key={+d}
              type="button"
              disabled={out}
              onClick={() => onPick(+d)}
              className={`num flex aspect-square items-center justify-center rounded-full text-base font-semibold transition disabled:opacity-25 ${
                selected ? 'bg-teal-700 text-white dark:bg-teal-600'
                : isSameDay(d, today) ? 'ring-2 ring-teal-600'
                : 'active:bg-black/10 dark:active:bg-white/10'
              } ${isSameMonth(d, view) ? '' : 'text-muted/60'}`}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Date only. Value is "yyyy-MM-dd" or "" (empty = no date, when `clearable`). */
export function DateField({ value, onChange, label, min, max, clearable = false, placeholder }: {
  value: string; onChange: (v: string) => void; label?: string; min?: string; max?: string; clearable?: boolean; placeholder?: string;
}) {
  const { t } = useTranslation();
  const fmt = useFmt();
  const [open, setOpen] = useState(false);
  const ms = value ? new Date(`${value}T00:00:00`).getTime() : null;
  const toMs = (s?: string) => (s ? new Date(`${s}T00:00:00`).getTime() : undefined);
  return (
    <>
      <div className="relative">
        <button type="button" className="input flex items-center gap-2 text-start" onClick={() => setOpen(true)} aria-label={label}>
          <CalendarDays className="size-4 shrink-0 text-muted" />
          <span className={`num truncate ${ms == null ? 'text-muted' : ''}`}>{ms == null ? placeholder ?? label ?? '—' : fmt.date(ms, 'medium')}</span>
        </button>
        {clearable && value && (
          <button type="button" className="absolute end-1 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center text-muted" onClick={() => onChange('')} aria-label={t('common.remove')}>
            <X className="size-4" />
          </button>
        )}
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} title={label}>
        <Calendar value={ms} min={toMs(min)} max={toMs(max)} onPick={(d) => { onChange(format(d, 'yyyy-MM-dd')); setOpen(false); }} />
        <button type="button" className="btn-soft mt-3 w-full" onClick={() => { onChange(format(Date.now(), 'yyyy-MM-dd')); setOpen(false); }}>
          {t('common.today')}
        </button>
      </Sheet>
    </>
  );
}

/** Date + time (24h). Value is epoch ms. */
export function DateTimeField({ value, onChange, label }: { value: number; onChange: (ms: number) => void; label?: string }) {
  const { t } = useTranslation();
  const fmt = useFmt();
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState(() => startOfDay(value).getTime());
  const [hour, setHour] = useState(() => new Date(value).getHours());
  const [minute, setMinute] = useState(() => new Date(value).getMinutes());

  const show = () => {
    const d = new Date(value);
    setDay(startOfDay(d).getTime());
    setHour(d.getHours());
    setMinute(d.getMinutes());
    setOpen(true);
  };
  const commit = () => {
    const d = new Date(day);
    d.setHours(hour, minute, 0, 0);
    onChange(d.getTime());
    setOpen(false);
  };
  const now = () => {
    const d = new Date();
    setDay(startOfDay(d).getTime());
    setHour(d.getHours());
    setMinute(d.getMinutes());
  };

  return (
    <>
      <button type="button" className="input flex items-center gap-2 text-start" onClick={show} aria-label={label}>
        <CalendarDays className="size-4 shrink-0 text-muted" />
        <span className="num flex-1 truncate">{fmt.date(value, 'medium')}</span>
        <Clock className="size-4 shrink-0 text-muted" />
        <span className="num">{pad(new Date(value).getHours())}:{pad(new Date(value).getMinutes())}</span>
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={label}
        footer={<button type="button" className="btn-primary w-full" onClick={commit}>{t('common.confirm')}</button>}>
        <Calendar value={day} onPick={setDay} />
        <div className="mt-4 flex items-center gap-2">
          <Clock className="size-5 text-muted" />
          {/* Time is always written hours:minutes, left to right */}
          <div dir="ltr" className="flex flex-1 items-center gap-1">
            <select className="input num text-center" value={hour} onChange={(e) => setHour(Number(e.target.value))} aria-label="HH">
              {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{pad(h)}</option>)}
            </select>
            <span className="text-xl font-bold">:</span>
            <select className="input num text-center" value={minute} onChange={(e) => setMinute(Number(e.target.value))} aria-label="MM">
              {Array.from({ length: 60 }, (_, m) => <option key={m} value={m}>{pad(m)}</option>)}
            </select>
          </div>
          <button type="button" className="btn-soft" onClick={now}>{t('common.now')}</button>
        </div>
      </Sheet>
    </>
  );
}
