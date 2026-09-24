import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Scale, Search } from 'lucide-react';
import type { Wallet } from '../data/types';
import { PageHeader, Sheet } from '../components/ui';
import { IconBadge } from '../components/Icon';
import { useToast } from '../components/Toast';
import { useBalances, useNames } from '../hooks/data';
import { useFmt } from '../hooks/fmt';
import { reconcile, RECONCILE_EVERY_DAYS } from '../repo/reconcile';
import { parseAmount } from '../lib/money';

const DAY = 86_400_000;

export default function Reconcile() {
  const { t } = useTranslation();
  const fmt = useFmt();
  const balances = useBalances();
  const { wallets, nameOf } = useNames();
  const [open, setOpen] = useState<Wallet | null>(null);
  return (
    <div>
      <PageHeader back title={t('reconcile.title')} />
      <div className="space-y-3 px-4">
        <p className="px-1 text-sm text-muted">{t('reconcile.intro')}</p>
        <div className="card divide-y divide-line overflow-hidden">
          {wallets?.filter((w) => !w.archived).map((w) => {
            const stale = !w.lastReconciledAt || Date.now() - w.lastReconciledAt > RECONCILE_EVERY_DAYS * DAY;
            return (
              <button key={w.id} className="flex min-h-16 w-full items-center gap-3 px-4 py-2 text-start" onClick={() => setOpen(w)}>
                <IconBadge name={w.icon} color={w.color} />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{nameOf(w)}</span>
                  <span className={`block text-sm ${stale ? 'text-amber-600' : 'text-muted'}`}>
                    {w.lastReconciledAt ? t('reconcile.last', { date: fmt.date(w.lastReconciledAt, 'medium') }) : t('reconcile.never')}
                  </span>
                </span>
                <span className="num font-bold">{fmt.money(balances?.byWallet.get(w.id) ?? 0)}</span>
              </button>
            );
          })}
        </div>
      </div>
      {open && <ReconcileSheet wallet={open} recorded={balances?.byWallet.get(open.id) ?? 0} onClose={() => setOpen(null)} />}
    </div>
  );
}

function ReconcileSheet({ wallet, recorded, onClose }: { wallet: Wallet; recorded: number; onClose: () => void }) {
  const { t } = useTranslation();
  const fmt = useFmt();
  const toast = useToast();
  const nav = useNavigate();
  const { nameOf } = useNames();
  const [real, setReal] = useState('');
  // The real balance may be negative (e.g. an overdrawn account): accept a leading minus.
  const neg = real.trim().startsWith('-');
  const abs = parseAmount(real.trim().replace(/^-/, ''));
  const realMinor = abs == null ? null : neg ? -abs : abs;
  const diff = realMinor == null ? null : realMinor - recorded;

  const apply = async (adjust: boolean) => {
    if (realMinor == null) return;
    const { undo } = await reconcile(wallet.id, realMinor, adjust);
    toast({ message: diff === 0 ? t('reconcile.matched') : t('reconcile.adjusted'), undo });
    onClose();
  };

  return (
    <Sheet open onClose={onClose} title={nameOf(wallet)}>
      <div className="space-y-4">
        <div className="card flex justify-between p-4">
          <span className="text-muted">{t('reconcile.recorded')}</span>
          <span className="num font-bold">{fmt.money(recorded)}</span>
        </div>
        <div>
          <label className="label" htmlFor="real">{t('reconcile.real')} ({fmt.currencyLabel})</label>
          <input id="real" className="input num text-lg" dir="ltr" inputMode="decimal" value={real} onChange={(e) => setReal(e.target.value)} autoFocus />
          <p className="mt-1 text-xs text-muted">{t('reconcile.realHint')}</p>
        </div>
        {diff != null && (
          diff === 0 ? (
            <div className="space-y-3">
              <p className="flex items-center gap-2 rounded-xl bg-emerald-600/10 p-3 font-semibold text-income"><CheckCircle2 className="size-5" />{t('reconcile.same')}</p>
              <button className="btn-primary w-full" onClick={() => apply(false)}>{t('reconcile.markChecked')}</button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="card p-4 text-center">
                <p className="text-sm text-muted">{t('reconcile.difference')}</p>
                <p className={`num text-2xl font-extrabold ${diff < 0 ? 'text-expense' : 'text-income'}`}>{fmt.money(diff, { sign: true })}</p>
                <p className="text-sm text-muted">{diff < 0 ? t('reconcile.lessThanRecorded') : t('reconcile.moreThanRecorded')}</p>
              </div>
              <button className="btn-primary w-full" onClick={() => apply(true)}>
                <Scale className="size-4" />{diff < 0 ? t('reconcile.recordExpense') : t('reconcile.recordIncome')}
              </button>
              <button className="btn-soft w-full" onClick={() => nav(`/transactions?w=${wallet.id}`)}>
                <Search className="size-4" />{t('reconcile.review')}
              </button>
            </div>
          )
        )}
      </div>
    </Sheet>
  );
}
