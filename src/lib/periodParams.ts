import { format, parse } from 'date-fns';
import { customPeriod, periodFor, type Period, type PeriodKind, type WeekStart } from './period';

const D = 'yyyy-MM-dd';
export const toDay = (ms: number) => format(ms, D);
export const fromDay = (s: string | null) => (s ? parse(s, D, new Date()).getTime() : NaN);

/** Reads a period from URL params: k=kind, a=anchor day, or s/e (inclusive days) for custom. */
export function periodFromParams(p: URLSearchParams, weekStartsOn: WeekStart, fallback: Exclude<PeriodKind, 'custom'> = 'month'): Period {
  const k = (p.get('k') as PeriodKind) || fallback;
  if (k === 'custom') {
    const s = fromDay(p.get('s')), e = fromDay(p.get('e'));
    if (!Number.isNaN(s) && !Number.isNaN(e)) return customPeriod(s, e);
    return periodFor('month', Date.now(), weekStartsOn);
  }
  const a = fromDay(p.get('a'));
  return periodFor(['day', 'week', 'month', 'year'].includes(k) ? (k as Exclude<PeriodKind, 'custom'>) : fallback, Number.isNaN(a) ? Date.now() : a, weekStartsOn);
}

export function periodToParams(p: Period): Record<string, string> {
  return p.kind === 'custom'
    ? { k: 'custom', s: toDay(p.start), e: toDay(p.end - 1) }
    : { k: p.kind, a: toDay(p.start) };
}

type Fmt = { date: (ms: number, style?: 'long' | 'dayMonth' | 'monthYear' | 'year' | 'medium') => string };

export function periodLabel(p: Period, fmt: Fmt): string {
  const last = p.end - 1;
  switch (p.kind) {
    case 'day': return fmt.date(p.start, 'long');
    case 'week': return `${fmt.date(p.start, 'dayMonth')} – ${fmt.date(last, 'dayMonth')}`;
    case 'month': return fmt.date(p.start, 'monthYear');
    case 'year': return fmt.date(p.start, 'year');
    case 'custom': return `${fmt.date(p.start, 'medium')} – ${fmt.date(last, 'medium')}`;
  }
}
