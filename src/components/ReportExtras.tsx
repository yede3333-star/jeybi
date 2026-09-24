// Phase-2 report sections: debts, budgets vs actual, savings progress.
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Transaction } from '../data/types';
import type { Period } from '../lib/period';
import { listDebts, summarize } from '../repo/debts';
import { monthBudgetStatuses, monthKey } from '../repo/budgets';
import { listGoals } from '../repo/goals';
import { useFmt } from '../hooks/fmt';
import { useNames } from '../hooks/data';
import { BudgetBar } from '../pages/Budgets';
import { fromMinor } from '../lib/money';

export function useReportExtras(period: Period, txs: Transaction[] | undefined) {
  const debts = useLiveQuery(listDebts, []);
  const budgets = useLiveQuery(() => (period.kind === 'month' ? monthBudgetStatuses(monthKey(period.start)) : Promise.resolve([])), [period.kind, period.start]);
  const goals = useLiveQuery(listGoals, []);
  // Debt movements inside the period
  let lent = 0, borrowed = 0, received = 0, paid = 0;
  const principalIds = new Set((debts ?? []).map((d) => d.debt.principalTxId));
  const dirOf = new Map((debts ?? []).map((d) => [d.debt.id, d.debt.direction]));
  for (const t of txs ?? []) {
    if (t.type !== 'debt' || t.deletedAt != null || t.date < period.start || t.date >= period.end) continue;
    const principal = principalIds.has(t.id);
    const mine = dirOf.get(t.debtId ?? '') === 'owed_to_me';
    if (principal) { if (mine) lent += t.amount; else borrowed += t.amount; }
    else if (mine) received += t.amount; else paid += t.amount;
  }
  return { debts, summary: debts ? summarize(debts) : null, activity: { lent, borrowed, received, paid }, budgets, goals };
}

export type ReportExtrasData = ReturnType<typeof useReportExtras>;

export function ReportExtras({ data }: { data: ReportExtrasData }) {
  const { t } = useTranslation();
  const fmt = useFmt();
  const { categoryName } = useNames();
  const { summary, activity, budgets, goals } = data;
  const anyActivity = Object.values(activity).some(Boolean);
  return (
    <>
      {summary && (summary.open > 0 || anyActivity) && (
        <section className="card p-4">
          <div className="mb-2 flex items-center justify-between"><h2 className="font-bold">{t('debts.title')}</h2><Link to="/debts" className="text-sm font-semibold text-teal-700 dark:text-teal-400">{t('common.seeAll')}</Link></div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div><p className="text-muted">{t('debts.owedToMe')}</p><p className="num font-bold text-income">{fmt.money(summary.owedToMe)}</p></div>
            <div><p className="text-muted">{t('debts.iOwe')}</p><p className="num font-bold text-expense">{fmt.money(summary.iOwe)}</p></div>
          </div>
          {anyActivity && (
            <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-line pt-3 text-sm">
              <span className="text-muted">{t('debts.inPeriod.lent')}</span><span className="num text-end">{fmt.money(activity.lent)}</span>
              <span className="text-muted">{t('debts.inPeriod.received')}</span><span className="num text-end">{fmt.money(activity.received)}</span>
              <span className="text-muted">{t('debts.inPeriod.borrowed')}</span><span className="num text-end">{fmt.money(activity.borrowed)}</span>
              <span className="text-muted">{t('debts.inPeriod.paid')}</span><span className="num text-end">{fmt.money(activity.paid)}</span>
            </div>
          )}
          <p className="mt-2 text-xs text-muted">{t('debts.notIncomeHint')}</p>
        </section>
      )}

      {budgets && budgets.length > 0 && (
        <section className="card p-4">
          <div className="mb-2 flex items-center justify-between"><h2 className="font-bold">{t('budgets.vsActual')}</h2><Link to="/budgets" className="text-sm font-semibold text-teal-700 dark:text-teal-400">{t('common.manage')}</Link></div>
          <div className="space-y-3">
            {budgets.map((b) => (
              <div key={b.budget.id}>
                <div className="flex justify-between text-sm"><span className="font-semibold">{categoryName(b.budget.categoryId, true)}</span><span className="num">{fmt.money(b.spent)} / {fmt.money(b.budget.amount)}</span></div>
                <div className="mt-1"><BudgetBar st={b} /></div>
              </div>
            ))}
          </div>
        </section>
      )}

      {goals && goals.length > 0 && (
        <section className="card p-4">
          <div className="mb-2 flex items-center justify-between"><h2 className="font-bold">{t('goals.progress')}</h2><Link to="/goals" className="text-sm font-semibold text-teal-700 dark:text-teal-400">{t('common.seeAll')}</Link></div>
          <div className="space-y-3">
            {goals.filter((g) => !g.goal.archived).map((g) => (
              <div key={g.goal.id}>
                <div className="flex justify-between text-sm"><span className="font-semibold">{g.goal.name}</span><span className="num">{fmt.pct(g.pct)}</span></div>
                <span className="mt-1 block h-2.5 overflow-hidden rounded-full bg-black/5 dark:bg-white/10"><span className="block h-2.5 rounded-full" style={{ width: `${g.pct}%`, backgroundColor: g.goal.color }} /></span>
                <p className="num mt-0.5 text-xs text-muted">{fmt.money(g.saved)} / {fmt.money(g.goal.target)}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

/** Extra Excel sheets for the same data. */
export function extrasSheets(data: ReportExtrasData, t: (k: string) => string, categoryName: (id: string) => string, formatDate: (ms: number) => string) {
  const sheets: Array<{ name: string; rows: Array<Array<string | number>> }> = [];
  if (data.debts?.length) sheets.push({
    name: t('debts.title'),
    rows: [[t('debts.person'), t('debts.type'), t('tx.amount'), t('debts.paid'), t('debts.remaining'), t('debts.date'), t('debts.dueDate'), t('debts.status')],
      ...data.debts.map((d) => [d.debt.person, d.debt.direction === 'owed_to_me' ? t('debts.owesMeShort') : t('debts.iOweShort'), fromMinor(d.debt.amount), fromMinor(d.paid), fromMinor(d.remaining),
        formatDate(d.debt.date), d.debt.dueDate ? formatDate(d.debt.dueDate) : '', d.closed ? t('debts.closed') : d.overdue ? t('debts.overdue') : t('debts.open')])],
  });
  if (data.budgets?.length) sheets.push({
    name: t('budgets.title'),
    rows: [[t('tx.category'), t('budgets.planned'), t('budgets.spent'), '%'],
      ...data.budgets.map((b) => [categoryName(b.budget.categoryId), fromMinor(b.budget.amount), fromMinor(b.spent), Math.round(b.pct)])],
  });
  if (data.goals?.length) sheets.push({
    name: t('goals.title'),
    rows: [[t('goals.name'), t('goals.target'), t('goals.saved'), '%', t('goals.targetDate'), t('goals.monthlyNeeded')],
      ...data.goals.map((g) => [g.goal.name, fromMinor(g.goal.target), fromMinor(g.saved), Math.round(g.pct), g.goal.targetDate ? formatDate(g.goal.targetDate) : '', g.monthlyNeeded != null ? fromMinor(g.monthlyNeeded) : ''])],
  });
  return sheets;
}
