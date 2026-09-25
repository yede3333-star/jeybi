import { useTranslation } from 'react-i18next';
import { ArrowLeftRight, HandCoins, Paperclip, Repeat, SplitSquareHorizontal } from 'lucide-react';
import type { Transaction } from '../data/types';
import { IconBadge } from './Icon';
import { useNames } from '../hooks/data';
import type { Formatters } from '../hooks/fmt';

/** One transaction line. `counted` overrides the displayed amount (filtered split parts). */
export function TxRow({ tx, fmt, onClick, counted, showDate = false }: {
  tx: Transaction; fmt: Formatters; onClick?: () => void; counted?: number; showDate?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const arrow = i18n.dir() === 'rtl' ? '←' : '→';
  const { category, categoryName, walletName, debtLabel } = useNames();
  const main = tx.splits.length ? [...tx.splits].sort((a, b) => b.amount - a.amount)[0] : undefined;
  const cat = category(main?.categoryId);
  const title = tx.type === 'debt' ? debtLabel(tx) : tx.type === 'transfer'
    ? t('types.transfer')
    : tx.splits.length > 1
      ? tx.splits.map((s) => categoryName(s.categoryId)).join(' + ')
      : categoryName(main?.categoryId);
  const sub = [
    tx.type === 'transfer' ? `${walletName(tx.walletId)} ${arrow} ${walletName(tx.toWalletId)}` : walletName(tx.walletId),
    tx.origCurrency ? `${fmt.num(tx.origAmount ?? 0)} ${tx.origCurrency}` : '',
    tx.note,
    ...tx.tags.map((x) => `#${x}`),
  ].filter(Boolean).join(' · ');
  const amount = counted ?? tx.amount;
  const color = tx.type === 'income' ? 'text-income' : tx.type === 'expense' ? 'text-expense' : 'text-transfer';
  const signed = tx.type === 'income' || (tx.type === 'debt' && tx.flow === 'in') ? amount : tx.type === 'expense' || tx.type === 'debt' ? -amount : amount;

  return (
    <button type="button" onClick={onClick} className="flex min-h-16 w-full items-center gap-3 px-4 py-2 text-start active:bg-black/5 dark:active:bg-white/5">
      {tx.type === 'debt' ? (
        <span className={`inline-flex size-10 shrink-0 items-center justify-center rounded-full text-white ${tx.flow === 'in' ? 'bg-emerald-600' : 'bg-rose-600'}`}>
          <HandCoins className="size-5" />
        </span>
      ) : tx.type === 'transfer' ? (
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
          <ArrowLeftRight className="size-5 rtl:-scale-x-100" />
        </span>
      ) : (
        <IconBadge name={cat?.icon ?? 'circle-ellipsis'} color={cat?.color ?? '#94a3b8'} />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 truncate font-semibold">
          <span className="truncate">{title}</span>
          {tx.splits.length > 1 && <SplitSquareHorizontal className="size-3.5 shrink-0 text-muted" />}
          {tx.receiptId && <Paperclip className="size-3.5 shrink-0 text-muted" />}
          {tx.recurringKey && <Repeat className="size-3.5 shrink-0 text-muted" />}
        </div>
        <div className="truncate text-sm text-muted">{sub}</div>
      </div>
      <div className="shrink-0 text-end">
        <div className={`num font-bold ${color}`}>{fmt.money(signed, { sign: tx.type !== 'transfer' })}</div>
        <div className="num text-xs text-muted">{showDate ? fmt.date(tx.date, 'dayMonth') + ' ' : ''}{fmt.date(tx.date, 'time')}</div>
      </div>
    </button>
  );
}

/** Groups transactions by calendar day (input sorted newest first). */
export function groupByDay<T extends { tx: Transaction }>(rows: T[]): Array<{ day: number; rows: T[] }> {
  const out: Array<{ day: number; rows: T[] }> = [];
  for (const r of rows) {
    const d = new Date(r.tx.date);
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const last = out[out.length - 1];
    if (last && last.day === day) last.rows.push(r);
    else out.push({ day, rows: [r] });
  }
  return out;
}
