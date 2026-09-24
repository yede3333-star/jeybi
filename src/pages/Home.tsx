import { Link, useNavigate } from 'react-router';
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
import { applyTemplate } from '../repo/templates';
import { setSettings } from '../repo/settings';

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
  const { openNew } = useTxEditor();
  const wallets = useWallets();
  const recent = useRecent(8);
  const templates = useTemplates();
  const balances = useBalances();
  const { nameOf, category } = useNames();

  // Period bounds only change when the day changes; recomputed on each render is cheap.
  const day = periodFor('day', Date.now(), s.weekStartsOn);
  const month = periodFor('month', Date.now(), s.weekStartsOn);
  const today = usePeriodTotals(day.start, day.end);
  const monthTotals = usePeriodTotals(month.start, month.end);
  const stats = today && monthTotals ? { today, month: monthTotals } : null;

  const runTemplate = async (id: string) => {
    const tpl = templates?.find((x) => x.id === id);
    if (!tpl) return;
    try {
      const { undo } = await applyTemplate(tpl);
      toast({ message: t('templates.applied', { name: tpl.name, amount: fmt.money(tpl.amount) }), undo });
    } catch (e) {
      toast({ message: String(e), tone: 'error' });
    }
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
        {wallets?.filter((w) => !w.archived).map((w) => (
          <button key={w.id} onClick={() => nav(`/transactions?w=${w.id}`)} className="card flex w-40 shrink-0 flex-col gap-2 p-3 text-start">
            <div className="flex items-center gap-2">
              <IconBadge name={w.icon} color={w.color} size="sm" />
              <span className="truncate text-sm font-semibold">{nameOf(w)}</span>
            </div>
            <span className={`num text-lg font-bold ${(balances?.byWallet.get(w.id) ?? 0) < 0 ? 'text-expense' : ''}`}>
              {fmt.money(balances?.byWallet.get(w.id) ?? 0)}
            </span>
          </button>
        ))}
      </div>

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
    </div>
  );
}
