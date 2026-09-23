import { useTranslation } from 'react-i18next';
import type { Report } from '../services/reports';
import { useNames } from '../hooks/data';
import type { Formatters } from '../hooks/fmt';

const REST_COLOR = '#10b981';
const MAX_PARTS = 6;

/**
 * Plain-language "Where did my money go?" summary: one sentence and one coloured bar.
 * Percentages are of income (or of expenses when there was no income).
 */
export function useWhere(report: Report) {
  const { categoryName, category } = useNames();
  const { income, expense, net } = report.totals;
  const base = income > 0 ? Math.max(income, expense) : expense;
  const slices = report.expenseByCategory;
  const top = slices.slice(0, MAX_PARTS);
  const others = slices.slice(MAX_PARTS).reduce((a, s) => a + s.amount, 0);
  const parts = top.map((s) => ({
    id: s.categoryId,
    name: categoryName(s.categoryId),
    color: category(s.categoryId)?.color ?? '#94a3b8',
    amount: s.amount,
    pctOfIncome: income > 0 ? (s.amount / income) * 100 : 0,
    width: base ? (s.amount / base) * 100 : 0,
  }));
  if (others > 0) parts.push({ id: 'others', name: '', color: '#94a3b8', amount: others, pctOfIncome: income ? (others / income) * 100 : 0, width: base ? (others / base) * 100 : 0 });
  const rest = income > 0 && net > 0 ? { amount: net, width: (net / base) * 100 } : null;
  return { income, expense, net, parts, rest };
}

export function WhereSummary({ report, periodText, fmt, large = false }: { report: Report; periodText: string; fmt: Formatters; large?: boolean }) {
  const { t } = useTranslation();
  const w = useWhere(report);
  const sep = t('where.sep');
  const named = w.parts.map((p) => ({ ...p, name: p.id === 'others' ? t('where.others') : p.name }));

  let sentence: string;
  if (w.income === 0 && w.expense === 0) sentence = t('where.nothing', { period: periodText });
  else if (w.income === 0) {
    sentence = `${t('where.noIncome', { period: periodText, expense: fmt.money(w.expense) })} ` +
      named.map((p) => t('where.part', { pct: fmt.pct((p.amount / w.expense) * 100), name: p.name })).join(sep) + '.';
  } else {
    sentence = `${t('where.intro', { period: periodText, income: fmt.money(w.income) })} ` +
      (named.length ? `${t('where.went')} ${named.map((p) => t('where.part', { pct: fmt.pct(p.pctOfIncome), name: p.name })).join(sep)}… ` : '') +
      (w.net >= 0 ? t('where.left', { amount: fmt.money(w.net) }) : t('where.overspent', { amount: fmt.money(-w.net) }));
  }

  return (
    <div className="space-y-4">
      <p className={`${large ? 'text-xl leading-9' : 'leading-7'} font-medium`}>{sentence}</p>
      {(w.income > 0 || w.expense > 0) && (
        <>
          <div className="flex h-8 w-full overflow-hidden rounded-full bg-black/5 dark:bg-white/10" role="img" aria-label={sentence}>
            {named.map((p) => <span key={p.id} style={{ width: `${p.width}%`, backgroundColor: p.color }} />)}
            {w.rest && <span style={{ width: `${w.rest.width}%`, backgroundColor: REST_COLOR }} />}
          </div>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {named.map((p) => (
              <li key={p.id} className="flex items-center gap-2">
                <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                <span className="num text-muted">{fmt.pct(w.income ? p.pctOfIncome : (p.amount / w.expense) * 100)}</span>
              </li>
            ))}
            {w.rest && (
              <li className="flex items-center gap-2">
                <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: REST_COLOR }} />
                <span className="min-w-0 flex-1 truncate">{t('where.rest')}</span>
                <span className="num text-muted">{fmt.pct((w.rest.amount / w.income) * 100)}</span>
              </li>
            )}
          </ul>
        </>
      )}
    </div>
  );
}
