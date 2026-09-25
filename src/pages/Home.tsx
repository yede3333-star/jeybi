import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslation } from 'react-i18next';
import { ArrowDownLeft, ArrowUpRight, ChevronLeft, CloudUpload, Plus, Zap } from 'lucide-react';
import { useBalances, useHasTransactions, useNames, usePeriodTotals, useRecent, useTemplates, useWallets } from '../hooks/data';
import { useFmt } from '../hooks/fmt';
import { useSettings } from '../hooks/settings';
import { IconBadge } from '../components/Icon';
import { TxRow } from '../components/TxRow';
import { Empty } from '../components/ui';
import { useToast } from '../components/Toast';
import { useTxEditor } from '../components/TxEditor';
import { periodFor } from '../lib/period';
import { applyTemplate, saveTemplate } from '../repo/templates';
import { ValidationError } from '../repo/transactions';
import { WalletPicker } from '../components/pickers';
import { Sheet } from '../components/ui';
import type { Template } from '../data/types';
import { setSettings } from '../repo/settings';
import { getReserved } from '../repo/goals';
import { debtSummary, netWorth } from '../repo/debts';
import { useDayKey } from '../hooks/day';
import { errorMessage } from '../services/errors';
import { markHomeReady } from '../services/startupTiming';
import { useImpactGuard } from '../components/Impact';
import { deltasForTx } from '../repo/impact';

// Reminders, indicators and tools: a separate chunk, mounted once the home screen is idle so they
// never delay the first paint after unlocking.
const HomeReminders = lazy(() => import('../components/HomeExtras'));
const HomeBottom = lazy(() => import('../components/HomeExtras').then((m) => ({ default: m.HomeBottom })));

function useIdle() {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    const ric = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 300));
    const id = ric(() => setIdle(true), { timeout: 800 } as IdleRequestOptions);
    return () => (window.cancelIdleCallback ?? window.clearTimeout)(id as number);
  }, []);
  return idle;
}

const DAY = 86_400_000;

function BackupBanner() {
  const { t } = useTranslation();
  const s = useSettings();
  const hasTx = useHasTransactions();
  const since = s.lastBackupAt ?? s.firstRunAt;
  const snoozed = s.backupBannerSnoozedAt && Date.now() - s.backupBannerSnoozedAt < DAY;
  if (!hasTx || !since || Date.now() - since < 7 * DAY || snoozed) return null;
  const days = Math.floor((Date.now() - since) / DAY);
  return (
    <div className="mx-4 mb-3 flex items-start gap-3 rounded-2xl bg-amber-100 p-3 text-amber-950 dark:bg-amber-400/15 dark:text-amber-200">
      <CloudUpload className="mt-0.5 size-5 shrink-0" />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold">{s.lastBackupAt ? t('backup.bannerDays', { days }) : t('backup.bannerNever')}</p>
        <p className="opacity-80">{t('backup.bannerHint')}</p>
        <div className="mt-2 flex gap-2">
          <Link to="/settings/backup" className="rounded-lg bg-amber-900 px-3 py-2 font-semibold text-white dark:bg-amber-300 dark:text-amber-950">{t('backup.now')}</Link>
          <button className="rounded-lg px-3 py-2 font-semibold" onClick={() => setSettings({ backupBannerSnoozedAt: Date.now() })}>{t('common.later')}</button>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const { t } = useTranslation();
  const fmt = useFmt();
  const s = useSettings();
  const nav = useNavigate();
  const toast = useToast();
  const guard = useImpactGuard();
  const { openNew } = useTxEditor();
  const wallets = useWallets();
  const recent = useRecent(8);
  const templates = useTemplates();
  const balances = useBalances();
  const { nameOf, category } = useNames();
  const idle = useIdle();
  const reserved = useLiveQuery(getReserved, []);
  const debts = useLiveQuery(debtSummary, []);

  // Period bounds only change when the day changes; recomputed on each render is cheap.
  useDayKey(); // re-render when the day changes (midnight / back from background)
  const day = periodFor('day', Date.now(), s.weekStartsOn);
  const month = periodFor('month', Date.now(), s.weekStartsOn);
  const today = usePeriodTotals(day.start, day.end);
  const monthTotals = usePeriodTotals(month.start, month.end);
  const stats = today && monthTotals ? { today, month: monthTotals } : null;
  const ready = !!balances && !!stats && recent !== undefined;
  useEffect(() => { if (ready) markHomeReady(); }, [ready]);

  // A template created before wallets were mandatory: choose its wallet once, then it records.
  const [pickFor, setPickFor] = useState<Template | null>(null);
  const runTemplate = async (id: string, tplArg?: Template) => {
    const tpl = tplArg ?? templates?.find((x) => x.id === id);
    if (!tpl) return;
    try {
      const go = tpl.walletId ? await guard(deltasForTx({ type: tpl.type, amount: tpl.amount, walletId: tpl.walletId, date: Date.now() })) : { after: async () => {} };
      if (!go) return;
      const { undo } = await applyTemplate(tpl);
      await go.after();
      toast({ message: t('templates.applied', { name: tpl.name, amount: fmt.money(tpl.amount) }), undo });
    } catch (e) {
      if (e instanceof ValidationError && e.code === 'templateWallet') { setPickFor(tpl); return; }
      toast({ message: errorMessage(e, t), tone: 'error' });
    }
  };
  const pickTemplateWallet = async (walletId: string | null) => {
    if (!pickFor || !walletId) return;
    const { id, order: _o, createdAt: _c, ...rest } = pickFor;
    const saved = await saveTemplate({ ...rest, id, walletId });
    setPickFor(null);
    await runTemplate(saved.id, saved);
  };

  const Chevron = <ChevronLeft className="size-4 ltr:rotate-180" />;

  return (
    <div>
      <header className="flex items-center justify-between px-4 pb-2 pt-4">
        <div>
          <h1 className="text-2xl font-extrabold text-teal-800 dark:text-teal-300">{t('app.name')}</h1>
          <p className="text-sm text-muted">{fmt.date(Date.now(), 'long')}</p>
        </div>
      </header>

      <BackupBanner />

      <section className="mx-4 rounded-3xl bg-gradient-to-br from-teal-700 to-teal-900 p-5 text-white shadow-lg">
        <p className="text-sm opacity-80">{t('home.totalBalance')}</p>
        <p className="num mt-1 text-4xl font-extrabold tracking-tight">{balances ? fmt.money(balances.total) : '…'}</p>
        {balances && debts && debts.open > 0 && (
          // the big number stays what is in the wallets; this line adds the debts
          <button onClick={() => nav('/debts')} className="mt-2 block w-full rounded-xl bg-white/10 px-3 py-2 text-start text-xs leading-6">
            <span>{t('home.owedToMe')}: <b className="num">{fmt.money(debts.owedToMe)}</b></span>
            {debts.overdueOwedToMe > 0 && <span className="num rounded bg-amber-300/25 px-1 text-amber-100"> {t('home.overdue', { amount: fmt.money(debts.overdueOwedToMe) })}</span>}
            <span className="opacity-60"> · </span>
            <span>{t('home.iOwe')}: <b className="num">{fmt.money(debts.iOwe)}</b></span>
            {debts.overdueIOwe > 0 && <span className="num rounded bg-rose-300/25 px-1 text-rose-100"> {t('home.overdue', { amount: fmt.money(debts.overdueIOwe) })}</span>}
            <span className="opacity-60"> · </span>
            <span className="font-semibold">{t('home.netWorth')}: <b className="num text-sm">{fmt.money(netWorth(balances.total, debts))}</b></span>
          </button>
        )}
        {stats && (
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-2xl bg-white/10 p-3">
              <p className="opacity-80">{t('home.thisMonth')}</p>
              <p className="num mt-1 flex items-center gap-1 font-semibold text-emerald-200"><ArrowDownLeft className="size-4" />{fmt.money(stats.month.income)}</p>
              <p className="num flex items-center gap-1 font-semibold text-rose-200"><ArrowUpRight className="size-4" />{fmt.money(stats.month.expense)}</p>
            </div>
            <div className="rounded-2xl bg-white/10 p-3">
              <p className="opacity-80">{t('common.today')}</p>
              <p className="num mt-1 flex items-center gap-1 font-semibold text-emerald-200"><ArrowDownLeft className="size-4" />{fmt.money(stats.today.income)}</p>
              <p className="num flex items-center gap-1 font-semibold text-rose-200"><ArrowUpRight className="size-4" />{fmt.money(stats.today.expense)}</p>
            </div>
          </div>
        )}
      </section>

      <div className="no-scrollbar mt-3 flex gap-3 overflow-x-auto px-4 pb-1">
        {wallets?.filter((w) => !w.archived).map((w) => {
          const bal = balances?.byWallet.get(w.id) ?? 0;
          const saved = reserved?.get(w.id) ?? 0;
          return (
            <div key={w.id} className={`card flex w-44 shrink-0 flex-col p-3 ${bal < 0 ? 'ring-2 ring-red-500/50' : ''}`}>
              <button onClick={() => nav(`/transactions?w=${w.id}`)} className="flex flex-col gap-2 text-start">
                <span className="flex items-center gap-2">
                  <IconBadge name={w.icon} color={w.color} size="sm" />
                  <span className="truncate text-sm font-semibold">{nameOf(w)}</span>
                </span>
                <span className={`num text-lg font-bold ${bal < 0 ? 'text-expense' : ''}`}>{fmt.money(bal)}</span>
              </button>
              {saved > 0 && (
                // money set aside for goals stays in the wallet: say what is really free to spend
                <button onClick={() => nav(`/goals?wallet=${w.id}`)} className="num mt-1 text-start text-xs text-muted underline decoration-dotted underline-offset-2">
                  {t('goals.savedAvailable', { saved: fmt.money(saved), available: fmt.money(bal - saved) })}
                </button>
              )}
              {bal < 0 && <Link to="/reconcile" className="mt-2 text-xs font-bold text-expense underline">{t('reconcile.action')}</Link>}
            </div>
          );
        })}
      </div>

      {idle && <Suspense fallback={null}><HomeReminders /></Suspense>}

      <div className="flex items-center justify-between px-4">
        <h2 className="section-title flex items-center gap-1"><Zap className="size-4" />{t('home.quick')}</h2>
        <Link to="/settings/templates" className="text-sm font-semibold text-teal-700 dark:text-teal-400">{t('common.manage')}</Link>
      </div>
      <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-1">
        {templates?.map((tpl) => {
          const c = category(tpl.categoryId);
          return (
            <button key={tpl.id} onClick={() => runTemplate(tpl.id)} className="chip min-h-12 shrink-0 gap-2 pe-4 ps-1.5">
              <IconBadge name={c?.icon ?? 'tag'} color={c?.color ?? '#94a3b8'} size="sm" />
              <span className="font-semibold">{tpl.name}</span>
              <span className={`num text-sm ${tpl.type === 'income' ? 'text-income' : 'text-muted'}`}>{fmt.num(tpl.amount)}</span>
            </button>
          );
        })}
        <Link to="/settings/templates?new=1" className="chip min-h-12 shrink-0 border-dashed text-muted">
          <Plus className="size-4" />{t('templates.add')}
        </Link>
      </div>

      <div className="flex items-center justify-between px-4">
        <h2 className="section-title">{t('home.recent')}</h2>
        <Link to="/transactions" className="flex items-center gap-0.5 text-sm font-semibold text-teal-700 dark:text-teal-400">{t('common.seeAll')}{Chevron}</Link>
      </div>
      <div className="card mx-4 divide-y divide-line overflow-hidden">
        {recent && recent.length === 0 && (
          <Empty title={t('home.emptyTitle')} hint={t('home.emptyHint')}
            action={<button className="btn-primary mt-2" onClick={() => openNew()}><Plus className="size-5" />{t('tx.new')}</button>} />
        )}
        {recent?.map((tx) => (
          <TxRow key={tx.id} tx={tx} fmt={fmt} showDate onClick={() => nav(`/tx/${tx.id}`)} />
        ))}
      </div>
      {idle && <Suspense fallback={null}><HomeBottom /></Suspense>}
      <Sheet open={!!pickFor} onClose={() => setPickFor(null)} title={t('templates.pickWalletTitle', { name: pickFor?.name ?? '' })}>
        <p className="mb-3 text-sm text-muted">{t('templates.pickWalletHint')}</p>
        <WalletPicker wallets={wallets ?? []} value={undefined} onChange={(id) => void pickTemplateWallet(id)} />
      </Sheet>
    </div>
  );
}
