// Loaded as its own chunk after the home screen is on screen (see Home.tsx).
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  AlertTriangle, BellRing, ChevronLeft, HandCoins, Lightbulb, Moon, PiggyBank, Repeat, Scale, Target, TrendingDown, TrendingUp,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { loadHomeExtras } from '../repo/homeExtras';
import { setSettings } from '../repo/settings';
import { useFmt } from '../hooks/fmt';
import { useNames } from '../hooks/data';
import { useTxEditor } from './TxEditor';
import { format } from 'date-fns';
import { useDayKey, useHourKey } from '../hooks/day';

function Reminder({ icon, tone = 'info', children, to, action }: { icon: ReactNode; tone?: 'info' | 'warn' | 'danger'; children: ReactNode; to?: string; action?: ReactNode }) {
  const cls = tone === 'danger' ? 'bg-red-600/10 text-red-800 dark:text-red-300' : tone === 'warn' ? 'bg-amber-100 text-amber-950 dark:bg-amber-400/15 dark:text-amber-200' : 'bg-teal-700/10 text-teal-900 dark:text-teal-200';
  const body = (
    <div className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm ${cls}`}>
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0 flex-1 font-medium">{children}</span>
      {action ?? (to && <ChevronLeft className="size-4 shrink-0 ltr:rotate-180" />)}
    </div>
  );
  return to ? <Link to={to} className="block">{body}</Link> : body;
}

/** Reminders, shown right under the wallets. */
export default function HomeReminders() {
  const { t } = useTranslation();
  const fmt = useFmt();
  const { categoryName } = useNames();
  const { openNew } = useTxEditor();
  const hour = useHourKey();
  const x = useLiveQuery(() => loadHomeExtras('reminders'), [hour]);
  if (!x) return null;
  const today = format(Date.now(), 'yyyy-MM-dd');

  const reminders: ReactNode[] = [];
  if (x.remindToday) reminders.push(
    <Reminder key="day" icon={<BellRing className="size-5" />} action={
      <span className="flex gap-1">
        <button className="rounded-lg bg-teal-700 px-2.5 py-1.5 text-xs font-bold text-white" onClick={() => openNew()}>{t('reminders.recordNow')}</button>
        <button className="rounded-lg px-2 py-1.5 text-xs font-bold" onClick={() => setSettings({ reminderSnoozedDay: today })}>{t('reminders.notToday')}</button>
      </span>
    }>{t('reminders.nothingToday')}</Reminder>,
  );
  if (x.pending) reminders.push(<Reminder key="pending" icon={<Repeat className="size-5" />} to="/recurring">{t('reminders.pending', { n: x.pending })}</Reminder>);
  for (const b of x.budgets.slice(0, 2)) reminders.push(
    <Reminder key={b.budget.id} tone={b.level >= 100 ? 'danger' : 'warn'} icon={<Target className="size-5" />} to="/budgets">
      {t(b.level >= 100 ? 'budgets.alert100' : 'budgets.alert80', { name: categoryName(b.budget.categoryId) })} <span className="num">({fmt.pct(b.pct)})</span>
    </Reminder>,
  );
  if (x.debts.overdue) reminders.push(<Reminder key="debts" tone="danger" icon={<AlertTriangle className="size-5" />} to="/debts">{t('debts.overdueCount', { n: x.debts.overdue })}</Reminder>);
  if (x.reconcile.length) reminders.push(<Reminder key="rec" icon={<Scale className="size-5" />} to="/reconcile">{t('reminders.reconcile', { n: x.reconcile.length })}</Reminder>);
  if (x.zakatDue) reminders.push(<Reminder key="zakat" tone="warn" icon={<Moon className="size-5" />} to="/zakat">{t('reminders.zakat')}</Reminder>);

  return reminders.length > 0 ? <div className="mt-3 space-y-2 px-4">{reminders}</div> : null;
}

/** Indicators and the tools grid, at the bottom of the home screen. */
export function HomeBottom() {
  const { t } = useTranslation();
  const fmt = useFmt();
  const { categoryName } = useNames();
  const day = useDayKey();
  const x = useLiveQuery(() => loadHomeExtras('insights'), [day]);
  const ins = x?.insights;
  const tools = [
    { to: '/debts', icon: <HandCoins className="size-6" />, label: t('debts.title') },
    { to: '/budgets', icon: <Target className="size-6" />, label: t('budgets.title') },
    { to: '/goals', icon: <PiggyBank className="size-6" />, label: t('goals.title') },
    { to: '/recurring', icon: <Repeat className="size-6" />, label: t('recurring.title') },
    { to: '/reconcile', icon: <Scale className="size-6" />, label: t('reconcile.title') },
    { to: '/zakat', icon: <Moon className="size-6" />, label: t('zakat.title') },
  ];

  const hasInsights = ins && (ins.avgDaily != null || ins.notes.length > 0);
  return (
    <>
      {hasInsights && (
        <section className="card mx-4 mt-3 p-4">
          <h2 className="mb-2 flex items-center gap-1 text-sm font-semibold text-muted"><Lightbulb className="size-4" />{t('insights.title')}</h2>
          {ins.avgDaily != null && (
            <div className="grid grid-cols-2 gap-3">
              <div><p className="text-xs text-muted">{t('insights.avgDaily')}</p><p className="num font-bold">{fmt.money(ins.avgDaily)}</p></div>
              <div><p className="text-xs text-muted">{t('insights.forecast')}</p><p className={`num font-bold ${ins.forecast! < 0 ? 'text-expense' : ''}`}>{fmt.money(ins.forecast!)}</p></div>
            </div>
          )}
          {ins.notes.length > 0 && (
            <ul className="mt-3 space-y-2 text-sm">
              {ins.notes.map((n) => (
                <li key={n.categoryId} className="flex items-start gap-2">
                  {n.diffPct > 0 ? <TrendingUp className="mt-0.5 size-4 shrink-0 text-expense" /> : <TrendingDown className="mt-0.5 size-4 shrink-0 text-income" />}
                  <span>{t(n.diffPct > 0 ? 'insights.more' : 'insights.less', { name: categoryName(n.categoryId), pct: fmt.pct(Math.abs(n.diffPct)) })}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <h2 className="section-title px-5">{t('home.tools')}</h2>
      <div className="grid grid-cols-3 gap-2 px-4">
        {tools.map((tool) => (
          <Link key={tool.to} to={tool.to} className="card flex flex-col items-center gap-1.5 px-1 py-3 text-center text-xs font-semibold text-teal-800 dark:text-teal-300">
            {tool.icon}<span className="text-ink">{tool.label}</span>
          </Link>
        ))}
      </div>
    </>
  );
}
