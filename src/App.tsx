import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { HashRouter, Link, NavLink, Route, Routes, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChartPie, House, List, MessageSquareText, Plus, Settings as SettingsIcon } from 'lucide-react';
import { SettingsProvider, useSettings } from './hooks/settings';
import { ToastProvider, useToast } from './components/Toast';
import { TxEditorProvider, useTxEditor } from './components/TxEditor';
import { LockGate, markUnlocked } from './components/Lock';
import { FileShareProvider } from './components/FileShare';
import { ImpactProvider } from './components/Impact';
import { initDatabase, requestPersistentStorage } from './repo/init';
import { getSettings, setSettings } from './repo/settings';
import { PrivacyReveal } from './components/PrivacyReveal';
import { logError } from './services/errorLog';
import i18n from './i18n';
import { isNative, native } from './platform';
import { useDayKey } from './hooks/day';
import { autoBackupDue, makeAutoBackup, notificationInputs } from './repo/phone';
import { planNotifications } from './services/notifyPlan';
import Home from './pages/Home';
// Only the home screen is in the startup bundle. Every other page (and its libraries: charts,
// Excel, PDF…) is a separate chunk loaded on first visit — all still precached for offline use.
const Transactions = lazy(() => import('./pages/Transactions'));
const TxDetail = lazy(() => import('./pages/TxDetail'));
const Onboarding = lazy(() => import('./pages/Onboarding'));
const Settings = lazy(() => import('./pages/Settings'));
const WalletsPage = lazy(() => import('./pages/Manage').then((m) => ({ default: m.WalletsPage })));
const CategoriesPage = lazy(() => import('./pages/Manage').then((m) => ({ default: m.CategoriesPage })));
const TemplatesPage = lazy(() => import('./pages/Manage').then((m) => ({ default: m.TemplatesPage })));
const Trash = lazy(() => import('./pages/Trash'));
const Security = lazy(() => import('./pages/Security'));
const Backup = lazy(() => import('./pages/Backup'));
const Reports = lazy(() => import('./pages/Reports'));
const WhereMoney = lazy(() => import('./pages/WhereMoney'));
const Debts = lazy(() => import('./pages/Debts'));
const Budgets = lazy(() => import('./pages/Budgets'));
const RecurringPage = lazy(() => import('./pages/Recurring'));
const Goals = lazy(() => import('./pages/Goals'));
const Reconcile = lazy(() => import('./pages/Reconcile'));
const Zakat = lazy(() => import('./pages/Zakat'));
const Currencies = lazy(() => import('./pages/Currencies'));
const ErrorsPage = lazy(() => import('./pages/ErrorsPage'));
// "اكتب يومك": the parser and its dictionary load with this page only.
const SmartEntry = lazy(() => import('./pages/SmartEntry'));
const SmartWords = lazy(() => import('./pages/SmartWords'));

/** Same look as the static shell in index.html, so there is no flash between them. */
function Splash() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-page">
      <img src="icons/icon-192.png" alt="" className="size-20 rounded-3xl opacity-90" />
    </div>
  );
}

function BottomNav() {
  const { t } = useTranslation();
  const items = [
    { to: '/', icon: House, label: t('nav.home'), end: true },
    { to: '/transactions', icon: List, label: t('nav.transactions') },
    { to: '/reports', icon: ChartPie, label: t('nav.reports') },
    { to: '/settings', icon: SettingsIcon, label: t('nav.settings') },
  ];
  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-md">
        {items.map(({ to, icon: I, label, end }) => (
          <NavLink key={to} to={to} end={end}
            className={({ isActive }) => `flex min-h-16 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-semibold ${isActive ? 'text-teal-700 dark:text-teal-400' : 'text-muted'}`}>
            <I className="size-6" />
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

function Fab() {
  const { t } = useTranslation();
  const { openNew } = useTxEditor();
  const { pathname } = useLocation();
  if (pathname === '/write') return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-30 mx-auto flex max-w-md items-center justify-end gap-3 px-4 safe-bottom">
      {pathname === '/' && (
        <Link to="/write" className="pointer-events-auto flex h-12 items-center gap-2 rounded-full bg-surface px-4 font-bold text-teal-800 shadow-lg shadow-black/10 ring-1 ring-line active:scale-95 dark:text-teal-300">
          <MessageSquareText className="size-5" />{t('smart.title')}
        </Link>
      )}
      <button onClick={() => openNew()} aria-label={t('tx.new')}
        className="pointer-events-auto flex size-16 items-center justify-center rounded-full bg-teal-700 text-white shadow-lg shadow-teal-900/30 active:scale-95 dark:bg-teal-600">
        <Plus className="size-8" />
      </button>
    </div>
  );
}

function ScrollTop() {
  const { pathname } = useLocation();
  // Braces matter: newer Chrome returns a Promise from scrollTo, which React would treat as a cleanup.
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

/**
 * Generates due recurring transactions once the home screen is visible (never before): there is no
 * server, so this is how they appear. Safe to run on every open — see repo/recurring.ts.
 */
function BackgroundJobs() {
  const toast = useToast();
  const { t } = useTranslation();
  useEffect(() => {
    const ric = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1000));
    ric(async () => {
      const { runRecurring } = await import('./repo/recurring');
      const r = await runRecurring().catch((e) => { logError(e, 'recurring'); return { created: 0, pending: 0 }; });
      if (r.created) {
        const { negativeNow } = await import('./repo/impact');
        const neg = await negativeNow().catch(() => []);
        if (neg.length) {
          const { db } = await import('./data/db');
          const w = await db.wallets.get(neg[0].walletId);
          const name = w ? (w.sysKey ? t(`sys.${w.sysKey}`) : w.name) : '';
          toast({ message: t('impact.recurringNegative', { n: r.created, wallet: name }), tone: 'error', duration: 8000 });
        } else toast({ message: t('recurring.autoCreated', { n: r.created }) });
      } else if (r.pending) toast({ message: t('reminders.pending', { n: r.pending }) });
    });
    // Errors that escaped the app's own handling: tell the user once, details are in the error log.
    const onUnexpected = () => toast({ message: t('errors.unexpectedLogged'), tone: 'error' });
    window.addEventListener('jeybi:unexpected-error', onUnexpected);
    return () => window.removeEventListener('jeybi:unexpected-error', onUnexpected);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/**
 * Android app only: keeps the phone's scheduled notifications (daily reminder, debts due, end of the
 * hawl) in line with the data, makes the weekly encrypted backup, and handles the back-button hint.
 */
function PhoneJobs() {
  const { t, i18n: i } = useTranslation();
  const toast = useToast();
  const day = useDayKey();
  const inputs = useLiveQuery(() => notificationInputs(), [day]);
  const lastPlan = useRef('');

  useEffect(() => {
    if (!inputs) return;
    const plan = planNotifications({ ...inputs, now: Date.now(), t: (k, v) => t(k, v) });
    const sig = JSON.stringify([plan, i.language]);
    if (sig === lastPlan.current) return;
    // debounced: typing several entries in a row reschedules once
    const id = window.setTimeout(() => {
      lastPlan.current = sig;
      native().then((n) => n.syncNotifications(plan, t('notify.channel'))).catch((e) => logError(e, 'notify:sync'));
    }, 1500);
    return () => clearTimeout(id);
  }, [inputs, t, i.language]);

  useEffect(() => {
    const ric = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 3000));
    ric(async () => {
      try {
        if (!(await autoBackupDue())) return;
        const n = await native();
        const f = await makeAutoBackup((text, stamp) => n.writeAutoBackup(text, stamp));
        await n.notifyAutoBackup(f, t('autoBackup.notifyTitle'), t('autoBackup.notifyBody'));
      } catch (e) {
        logError(e, 'autoBackup');
        toast({ message: t('autoBackup.failed'), tone: 'error' });
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onHint = () => toast({ message: t('app.backAgainToExit') });
    window.addEventListener('jeybi:exit-hint', onHint);
    return () => window.removeEventListener('jeybi:exit-hint', onHint);
  }, [t, toast]);
  return null;
}

/** Shown when a new version has been downloaded; the app keeps working until the user restarts. */
function UpdateBanner() {
  const { t } = useTranslation();
  const [apply, setApply] = useState<((reload: boolean) => Promise<void>) | null>(null);
  useEffect(() => {
    const on = (e: Event) => setApply(() => (e as CustomEvent).detail);
    window.addEventListener('jeybi:update-ready', on);
    return () => window.removeEventListener('jeybi:update-ready', on);
  }, []);
  if (!apply) return null;
  return (
    <div className="fixed inset-x-0 top-0 z-40 mx-auto flex max-w-md items-center gap-3 bg-teal-800 px-4 pb-2 text-sm text-white" style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}>
      <span className="flex-1">{t('app.updateReady')}</span>
      <button className="rounded-lg bg-white/15 px-3 py-1.5 font-bold" onClick={() => { markUnlocked(); void apply(true); }}>
        {t('app.restart')}
      </button>
    </div>
  );
}

function Shell() {
  return (
    <HashRouter>
      <UpdateBanner />
      <PrivacyReveal />
      <ScrollTop />
      <BackgroundJobs />
      {isNative && <PhoneJobs />}
      <main className="mx-auto min-h-dvh max-w-md pb-40">
        <Suspense fallback={<Splash />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/tx/:id" element={<TxDetail />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/reports/where" element={<WhereMoney />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/settings/wallets" element={<WalletsPage />} />
            <Route path="/settings/categories" element={<CategoriesPage />} />
            <Route path="/settings/templates" element={<TemplatesPage />} />
            <Route path="/settings/trash" element={<Trash />} />
            <Route path="/settings/security" element={<Security />} />
            <Route path="/settings/backup" element={<Backup />} />
            <Route path="/settings/currencies" element={<Currencies />} />
            <Route path="/settings/errors" element={<ErrorsPage />} />
            <Route path="/settings/words" element={<SmartWords />} />
            <Route path="/write" element={<SmartEntry />} />
            <Route path="/debts" element={<Debts />} />
            <Route path="/budgets" element={<Budgets />} />
            <Route path="/recurring" element={<RecurringPage />} />
            <Route path="/goals" element={<Goals />} />
            <Route path="/reconcile" element={<Reconcile />} />
            <Route path="/zakat" element={<Zakat />} />
            <Route path="*" element={<Home />} />
          </Routes>
        </Suspense>
      </main>
      <Fab />
      <BottomNav />
    </HashRouter>
  );
}

function Gate() {
  const s = useSettings();
  useEffect(() => {
    if (!s.onboarded) return;
    const ric = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 2000));
    // Android: IndexedDB lives in the app's private storage and is only removed with the app.
    if (!isNative) ric(() => { void requestPersistentStorage(); });
  }, [s.onboarded]);
  if (!s.onboarded) return <Suspense fallback={<Splash />}><Onboarding /></Suspense>;
  return (
    <LockGate>
      <ImpactProvider>
        <TxEditorProvider>
          <FileShareProvider>
            <Shell />
          </FileShareProvider>
        </TxEditorProvider>
      </ImpactProvider>
    </LockGate>
  );
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    initDatabase()
      .then(async () => {
        // privacy mode: "hide amounts when the app opens"
        const s = await getSettings();
        if (s.hideOnOpen && !s.amountsHidden) await setSettings({ amountsHidden: true });
      })
      .then(() => setReady(true), (e) => { logError(e, 'init'); setFailed(String((e as Error)?.name ?? e)); });
  }, []);
  if (failed) return (
    <div className="p-6 text-center">
      <p className="font-bold text-expense">{i18n.t('errors.storageFailed')}</p>
      <p className="mt-2 text-sm text-muted">{i18n.t('errors.storageFailedHint')} ({failed})</p>
    </div>
  );
  if (!ready) return <Splash />;
  return (
    <SettingsProvider fallback={<Splash />}>
      <ToastProvider>
        <Gate />
      </ToastProvider>
    </SettingsProvider>
  );
}
