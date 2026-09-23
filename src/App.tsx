import { lazy, Suspense, useEffect, useState } from 'react';
import { HashRouter, NavLink, Route, Routes, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ChartPie, House, List, Plus, Settings as SettingsIcon } from 'lucide-react';
import { SettingsProvider, useSettings } from './hooks/settings';
import { ToastProvider } from './components/Toast';
import { TxEditorProvider, useTxEditor } from './components/TxEditor';
import { LockGate } from './components/Lock';
import { initDatabase, requestPersistentStorage } from './repo/init';
import Home from './pages/Home';
import Transactions from './pages/Transactions';
import TxDetail from './pages/TxDetail';
import Onboarding from './pages/Onboarding';
import Settings from './pages/Settings';
import { WalletsPage, CategoriesPage, TemplatesPage } from './pages/Manage';
import Trash from './pages/Trash';
import Security from './pages/Security';
import Backup from './pages/Backup';

// Reports pull in charts and export libraries: load them on demand (still precached for offline use).
const Reports = lazy(() => import('./pages/Reports'));
const WhereMoney = lazy(() => import('./pages/WhereMoney'));

function Splash() {
  return <div className="min-h-dvh bg-page" />;
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
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-30 mx-auto flex max-w-md justify-end px-4 safe-bottom">
      <button onClick={() => openNew()} aria-label={t('tx.new')}
        className="pointer-events-auto flex size-16 items-center justify-center rounded-full bg-teal-700 text-white shadow-lg shadow-teal-900/30 active:scale-95 dark:bg-teal-600">
        <Plus className="size-8" />
      </button>
    </div>
  );
}

function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => window.scrollTo(0, 0), [pathname]);
  return null;
}

function Shell() {
  return (
    <HashRouter>
      <ScrollTop />
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
    if (s.onboarded) void requestPersistentStorage();
  }, [s.onboarded]);
  if (!s.onboarded) return <Onboarding />;
  return (
    <LockGate>
      <TxEditorProvider>
        <Shell />
      </TxEditorProvider>
    </LockGate>
  );
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    initDatabase().then(() => setReady(true), (e) => setFailed(String(e)));
  }, []);
  if (failed) return <p className="p-6 text-expense">IndexedDB: {failed}</p>;
  if (!ready) return <Splash />;
  return (
    <SettingsProvider fallback={<Splash />}>
      <ToastProvider>
        <Gate />
      </ToastProvider>
    </SettingsProvider>
  );
}
