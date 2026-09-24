import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { addMonths } from 'date-fns';
import { ChevronLeft, ChevronRight, Copy, Plus, Target } from 'lucide-react';
import type { ID } from '../data/types';
import { PageHeader, Sheet, Empty } from '../components/ui';
import { IconBadge } from '../components/Icon';
import { CategorySelect } from '../components/pickers';
import { useToast } from '../components/Toast';
import { useNames } from '../hooks/data';
import { useFmt } from '../hooks/fmt';
import { copyPreviousMonth, monthBudgetStatuses, monthKey, monthRange, setBudget, type BudgetStatus } from '../repo/budgets';
import { minorToKeypad, parseAmount } from '../lib/money';

export function levelColor(level: number) {
  return level >= 100 ? 'bg-red-600' : level >= 80 ? 'bg-amber-500' : 'bg-teal-600';
}

export function BudgetBar({ st }: { st: BudgetStatus }) {
  return (
    <span className="block h-2.5 overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
      <span className={`block h-2.5 rounded-full ${levelColor(st.level)}`} style={{ width: `${Math.min(100, st.pct)}%` }} />
    </span>
  );
}

export default function Budgets() {
  const { t } = useTranslation();
  const fmt = useFmt();
  const toast = useToast();
  const { category, categoryName } = useNames();
  const [month, setMonth] = useState(monthKey(Date.now()));
  const statuses = useLiveQuery(() => monthBudgetStatuses(month), [month]);
  const [edit, setEdit] = useState<{ categoryId: ID | ''; amount: string } | null>(null);
  const start = monthRange(month).start;
  const totals = useMemo(() => (statuses ?? []).reduce((a, s) => ({ b: a.b + s.budget.amount, s: a.s + s.spent }), { b: 0, s: 0 }), [statuses]);

  const copy = async () => {
    const n = await copyPreviousMonth(month);
    toast({ message: n ? t('budgets.copied', { n }) : t('budgets.nothingToCopy') });
  };
  const save = async () => {
    if (!edit?.categoryId) return;
    await setBudget(month, edit.categoryId, parseAmount(edit.amount) ?? 0);
    setEdit(null);
  };

  return (
    <div>
      <PageHeader back title={t('budgets.title')} actions={
        <button className="btn-ghost size-11 min-h-11 rounded-full p-0" onClick={() => setEdit({ categoryId: '', amount: '' })} aria-label={t('common.add')}><Plus className="size-6" /></button>
      } />
      <div className="space-y-3 px-4">
        <div className="flex items-center gap-2">
          <button className="btn-ghost size-11 min-h-11 rounded-full p-0" onClick={() => setMonth(monthKey(+addMonths(start, -1)))} aria-label={t('period.previous')}><ChevronLeft className="size-6 rtl:rotate-180" /></button>
          <span className="flex-1 text-center text-lg font-bold">{fmt.date(start, 'monthYear')}</span>
          <button className="btn-ghost size-11 min-h-11 rounded-full p-0" onClick={() => setMonth(monthKey(+addMonths(start, 1)))} aria-label={t('period.next')}><ChevronRight className="size-6 rtl:rotate-180" /></button>
        </div>
        {statuses && statuses.length > 0 && (
          <div className="card p-4">
            <div className="flex justify-between text-sm"><span className="text-muted">{t('budgets.spent')}</span><span className="text-muted">{t('budgets.planned')}</span></div>
            <div className="flex justify-between"><span className="num text-xl font-bold">{fmt.money(totals.s)}</span><span className="num text-xl font-bold">{fmt.money(totals.b)}</span></div>
          </div>
        )}
        <button className="btn-soft w-full" onClick={copy}><Copy className="size-4" />{t('budgets.copyLast')}</button>
        {statuses && statuses.length === 0 && <Empty icon={<Target className="size-10" />} title={t('budgets.empty')} hint={t('budgets.emptyHint')} />}
        <div className="card divide-y divide-line overflow-hidden">
          {statuses?.map((s) => {
            const c = category(s.budget.categoryId);
            return (
              <button key={s.budget.id} className="block w-full px-4 py-3 text-start" onClick={() => setEdit({ categoryId: s.budget.categoryId, amount: minorToKeypad(s.budget.amount) })}>
                <div className="flex items-center gap-3">
                  <IconBadge name={c?.icon ?? 'tag'} color={c?.color ?? '#94a3b8'} size="sm" />
                  <span className="flex-1 font-semibold">{categoryName(s.budget.categoryId, true)}</span>
                  <span className={`num text-sm font-bold ${s.level >= 100 ? 'text-expense' : s.level >= 80 ? 'text-amber-600' : ''}`}>{fmt.pct(s.pct)}</span>
                </div>
                <div className="mt-2"><BudgetBar st={s} /></div>
                <div className="num mt-1 flex justify-between text-xs text-muted">
                  <span>{fmt.money(s.spent)} / {fmt.money(s.budget.amount)}</span>
                  <span>{s.spent <= s.budget.amount ? t('budgets.left', { amount: fmt.money(s.budget.amount - s.spent) }) : t('budgets.over', { amount: fmt.money(s.spent - s.budget.amount) })}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
      <Sheet open={!!edit} onClose={() => setEdit(null)} title={t('budgets.edit')}
        footer={<button className="btn-primary w-full" disabled={!edit?.categoryId} onClick={save}>{t('common.save')}</button>}>
        {edit && (
          <div className="space-y-4">
            <div><span className="label">{t('tx.category')}</span><CategorySelect kind="expense" value={edit.categoryId} onChange={(id) => setEdit({ ...edit, categoryId: id })} /></div>
            <div>
              <label className="label" htmlFor="bamount">{t('budgets.monthlyLimit')} ({fmt.currencyLabel})</label>
              <input id="bamount" className="input num text-lg" dir="ltr" inputMode="decimal" value={edit.amount} onChange={(e) => setEdit({ ...edit, amount: e.target.value })} />
              <p className="mt-1 text-xs text-muted">{t('budgets.zeroRemoves')}</p>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}
