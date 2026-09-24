// Everything the home screen shows below the fold (reminders + indicators), computed after the
// home screen is visible. Only small tables and indexed date ranges are read — never all transactions.
import { format, startOfDay } from 'date-fns';
import { db } from '../data/db';
import { computeInsights, insightsRange, type Insights } from '../services/insights';
import { hawlStatus } from '../services/zakat';
import { monthBudgetStatuses, monthKey, type BudgetStatus } from './budgets';
import { debtSummary, type DebtSummary } from './debts';
import { walletsToReconcile } from './reconcile';
import { getBalances } from './summary';
import { getSettings } from './settings';
import type { Wallet } from '../data/types';

export interface HomeExtras {
  pending: number;
  budgets: BudgetStatus[];
  debts: DebtSummary;
  reconcile: Wallet[];
  /** true when the daily reminder banner should show. */
  remindToday: boolean;
  zakatDue: boolean;
  insights: Insights | null;
}

export async function loadHomeExtras(part: 'reminders' | 'insights', now = Date.now()): Promise<HomeExtras> {
  const wantInsights = part === 'insights';
  const s = await getSettings();
  const dayStart = +startOfDay(now);
  const range = insightsRange(now);
  const [pending, budgets, debts, balances, wallets, todayCount, first, recentTxs, categories] = await Promise.all([
    db.pending.count(),
    wantInsights ? Promise.resolve([]) : monthBudgetStatuses(monthKey(now)),
    wantInsights ? Promise.resolve({ owedToMe: 0, iOwe: 0, overdue: 0, open: 0 }) : debtSummary(),
    getBalances(),
    db.wallets.toArray(),
    db.transactions.where('date').between(dayStart, dayStart + 86_400_000, true, false).filter((t) => t.deletedAt == null).count(),
    db.transactions.orderBy('date').first(),
    wantInsights && s.insightsEnabled ? db.transactions.where('date').between(range.start, range.end, true, false).toArray() : Promise.resolve([]),
    db.categories.toArray(),
  ]);
  const hour = new Date(now).getHours();
  const today = format(now, 'yyyy-MM-dd');
  const hawl = hawlStatus(s.zakat.hawlStart, now);
  return {
    pending,
    budgets: budgets.filter((b) => b.level >= 80),
    debts,
    reconcile: walletsToReconcile(wallets, balances.byWallet, s.firstRunAt, now),
    remindToday: s.reminderEnabled && hour >= s.reminderHour && todayCount === 0 && s.reminderSnoozedDay !== today && !!first,
    zakatDue: !!hawl?.complete,
    insights: wantInsights && s.insightsEnabled
      ? computeInsights({ txs: recentTxs, categories, totalBalance: balances.total, firstTxDate: first?.date ?? null, now, thresholdPct: s.insightThresholdPct })
      : null,
  };
}
