// Home-screen indicators. Pure: the caller passes only the transactions of the last ~35 days
// (indexed date range) — never the whole history.
import { differenceInCalendarDays, endOfMonth, startOfDay, startOfMonth } from 'date-fns';
import type { Category, ID, Transaction } from '../data/types';

const DAY = 86_400_000;
export const INSIGHT_WINDOW_DAYS = 35;
/** Minimum weekly average (base minor units) for a category note: ignores tiny categories. */
const MIN_WEEKLY_AVG = 500_00;
/** Minimum absolute difference for a note (base minor units). */
const MIN_DIFF = 300_00;
const MIN_DAYS_FOR_AVERAGE = 5;
const MIN_EXPENSES_FOR_AVERAGE = 3;

export interface SpendingNote {
  categoryId: ID;
  last7: number;
  weeklyAvg: number;
  /** +30 means 30% more than usual, −40 means 40% less. */
  diffPct: number;
}

export interface Insights {
  /** Average daily spending this month (null until there is enough data). */
  avgDaily: number | null;
  /** Projected balance at month end if spending continues at the same pace. */
  forecast: number | null;
  notes: SpendingNote[];
}

export function computeInsights(input: {
  txs: Transaction[];
  categories: Category[];
  totalBalance: number;
  /** Date of the very first transaction (to know if 5 weeks of history exist). */
  firstTxDate: number | null;
  now: number;
  thresholdPct: number;
}): Insights {
  const { txs, categories, totalBalance, firstTxDate, now, thresholdPct } = input;
  const live = txs.filter((t) => t.deletedAt == null && t.type === 'expense');

  // --- average and forecast (this calendar month)
  const mStart = +startOfMonth(now);
  const daysElapsed = differenceInCalendarDays(now, mStart) + 1;
  const monthExp = live.filter((t) => t.date >= mStart && t.date <= now);
  const monthTotal = monthExp.reduce((a, t) => a + t.amount, 0);
  const historyStart = Math.max(mStart, firstTxDate ?? now);
  const daysOfData = differenceInCalendarDays(now, historyStart) + 1;
  let avgDaily: number | null = null, forecast: number | null = null;
  if (daysOfData >= MIN_DAYS_FOR_AVERAGE && monthExp.length >= MIN_EXPENSES_FOR_AVERAGE) {
    avgDaily = Math.round(monthTotal / Math.min(daysElapsed, daysOfData));
    const daysLeft = differenceInCalendarDays(endOfMonth(now), now);
    forecast = totalBalance - avgDaily * daysLeft;
  }

  // --- category notes: last 7 days vs the 4 weeks before
  const notes: SpendingNote[] = [];
  const today = +startOfDay(now);
  const w0 = today - 6 * DAY; // last 7 days = [w0, now]
  const hasHistory = firstTxDate != null && firstTxDate <= w0 - 28 * DAY;
  if (hasHistory) {
    const parent = new Map(categories.map((c) => [c.id, c.parentId]));
    const top = (id: ID) => parent.get(id) ?? id;
    const recent = new Map<ID, number>();
    const weeks = new Map<ID, number[]>();
    for (const t of live) {
      for (const s of t.splits) {
        const c = top(s.categoryId);
        if (t.date >= w0 && t.date <= now) recent.set(c, (recent.get(c) ?? 0) + s.amount);
        else if (t.date < w0 && t.date >= w0 - 28 * DAY) {
          const k = Math.floor((w0 - 1 - t.date) / (7 * DAY)); // 0..3
          const arr = weeks.get(c) ?? [0, 0, 0, 0];
          arr[k] += s.amount;
          weeks.set(c, arr);
        }
      }
    }
    for (const [c, arr] of weeks) {
      if (arr.filter((v) => v > 0).length < 2) continue; // not a regular expense
      const avg = arr.reduce((a, v) => a + v, 0) / 4;
      if (avg < MIN_WEEKLY_AVG) continue;
      const last7 = recent.get(c) ?? 0;
      const diffPct = ((last7 - avg) / avg) * 100;
      if (Math.abs(diffPct) >= thresholdPct && Math.abs(last7 - avg) >= MIN_DIFF) {
        notes.push({ categoryId: c, last7, weeklyAvg: Math.round(avg), diffPct: Math.round(diffPct) });
      }
    }
    notes.sort((a, b) => Math.abs(b.last7 - b.weeklyAvg) - Math.abs(a.last7 - a.weeklyAvg));
  }
  return { avgDaily, forecast, notes: notes.slice(0, 3) };
}

/** Range to read for computeInsights: from the earlier of month start and 5 weeks ago. */
export function insightsRange(now: number) {
  return { start: Math.min(+startOfMonth(now), +startOfDay(now) - INSIGHT_WINDOW_DAYS * DAY), end: now + 1 };
}
