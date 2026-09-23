import {
  addDays, addMonths, addWeeks, addYears, differenceInCalendarDays, startOfDay, startOfMonth,
  startOfWeek, startOfYear, addHours,
} from 'date-fns';

export type PeriodKind = 'day' | 'week' | 'month' | 'year' | 'custom';
export type WeekStart = 0 | 1 | 6;

/** Half-open interval [start, end) in epoch ms, local time. */
export interface Period {
  kind: PeriodKind;
  start: number;
  end: number;
}

export function periodFor(kind: Exclude<PeriodKind, 'custom'>, anchor: Date | number, weekStartsOn: WeekStart = 1): Period {
  const a = new Date(anchor);
  switch (kind) {
    case 'day': {
      const s = startOfDay(a);
      return { kind, start: +s, end: +addDays(s, 1) };
    }
    case 'week': {
      const s = startOfWeek(a, { weekStartsOn });
      return { kind, start: +s, end: +addWeeks(s, 1) };
    }
    case 'month': {
      const s = startOfMonth(a);
      return { kind, start: +s, end: +addMonths(s, 1) };
    }
    case 'year': {
      const s = startOfYear(a);
      return { kind, start: +s, end: +addYears(s, 1) };
    }
  }
}

/** Custom range: both dates inclusive (whole days). */
export function customPeriod(from: Date | number, to: Date | number): Period {
  let s = startOfDay(new Date(from));
  let e = startOfDay(new Date(to));
  if (e < s) [s, e] = [e, s];
  return { kind: 'custom', start: +s, end: +addDays(e, 1) };
}

export function shiftPeriod(p: Period, dir: 1 | -1, weekStartsOn: WeekStart = 1): Period {
  const s = new Date(p.start);
  switch (p.kind) {
    case 'day': return periodFor('day', addDays(s, dir), weekStartsOn);
    case 'week': return periodFor('week', addWeeks(s, dir), weekStartsOn);
    case 'month': return periodFor('month', addMonths(s, dir), weekStartsOn);
    case 'year': return periodFor('year', addYears(s, dir), weekStartsOn);
    case 'custom': {
      const days = periodDays(p);
      const ns = addDays(s, dir * days);
      return { kind: 'custom', start: +ns, end: +addDays(ns, days) };
    }
  }
}

export const previousPeriod = (p: Period, weekStartsOn: WeekStart = 1) => shiftPeriod(p, -1, weekStartsOn);

export function periodDays(p: Period): number {
  return differenceInCalendarDays(new Date(p.end), new Date(p.start));
}

export const inPeriod = (t: number, p: Period) => t >= p.start && t < p.end;

export type BucketUnit = 'hour' | 'day' | 'month';
export interface Bucket { start: number; end: number; unit: BucketUnit }

/** Time buckets for the timeline chart. */
export function bucketsFor(p: Period): Bucket[] {
  const unit: BucketUnit =
    p.kind === 'day' ? 'hour'
    : p.kind === 'year' ? 'month'
    : p.kind === 'custom' && periodDays(p) > 62 ? 'month'
    : 'day';
  const out: Bucket[] = [];
  let cur = new Date(p.start);
  if (unit === 'month') cur = startOfMonth(cur);
  const step = (d: Date) => (unit === 'hour' ? addHours(d, 3) : unit === 'day' ? addDays(d, 1) : addMonths(d, 1));
  while (+cur < p.end) {
    const next = step(cur);
    out.push({ start: Math.max(+cur, p.start), end: Math.min(+next, p.end), unit });
    cur = next;
  }
  return out;
}
