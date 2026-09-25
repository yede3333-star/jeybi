import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Bug, BellRing, Coins, HandCoins, Lightbulb, Moon, PiggyBank, Repeat, Scale, Target,
  ChevronLeft, CloudUpload, Database, FlaskConical, FolderTree, HardDrive, Lock, RotateCcw, Trash2, Wallet, Zap,
} from 'lucide-react';
import { PageHeader, Segmented, Sheet } from '../components/ui';
import { isNative, native } from '../platform';
import { useToast } from '../components/Toast';
import { useLang, useSettings } from '../hooks/settings';
import { setSettings, type Settings as S } from '../repo/settings';
import { addDemoData, clearDemoData, hasDemoData } from '../repo/demo';
import { wipeAll } from '../repo/init';
import { hasTransactions } from '../repo/summary';
import { Toggle } from '../components/ui';
import { readErrors } from '../services/errorLog';
import type { WeekStart } from '../lib/period';
import { errorMessage } from '../services/errors';

function LinkRow({ to, icon, label, hint }: { to: string; icon: ReactNode; label: string; hint?: string }) {
  return (
    <Link to={to} className="flex min-h-14 items-center gap-3 px-4 py-2 active:bg-black/5 dark:active:bg-white/5">
      <span className="text-muted">{icon}</span>
      <span className="flex-1">
        <span className="block font-semibold">{label}</span>
        {hint && <span className="block text-sm text-muted">{hint}</span>}
      </span>
      <ChevronLeft className="size-5 text-muted ltr:rotate-180" />
    </Link>
  );
}

export default function Settings() {
  const { t } = useTranslation();
  const s = useSettings();
  const lang = useLang();
  const toast = useToast();
  const demo = useLiveQuery(hasDemoData, [], false);
  // The base currency is locked once transactions exist: stored amounts are in that currency.
  const locked = useLiveQuery(hasTransactions, [], true);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const errorCount = readErrors().length;

  useEffect(() => { if (isNative) setPersisted(true); else void navigator.storage?.persisted?.().then(setPersisted); }, []);
  const [resetOpen, setResetOpen] = useState(false);

  const toggleDemo = async () => {
    setBusy(true);
    try {
      if (demo) toast({ message: t('settings.demoCleared', { n: await clearDemoData() }) });
      else toast({ message: t('settings.demoAdded', { n: await addDemoData(lang) }) });
    } catch (e) {
      toast({ message: errorMessage(e, t), tone: 'error' });
    } finally {
      setBusy(false);
    }
  };


  return (
    <div>
      <PageHeader title={t('nav.settings')} />
      <div className="px-4">
        <h2 className="section-title">{t('settings.appearance')}</h2>
        <div className="card space-y-4 p-4">
          <div>
            <span className="label">{t('settings.language')}</span>
            <Segmented<'ar' | 'fr'> value={lang} onChange={(v) => setSettings({ lang: v })}
              options={[{ value: 'ar', label: 'العربية' }, { value: 'fr', label: 'Français' }]} />
          </div>
          <div>
            <span className="label">{t('settings.theme')}</span>
            <Segmented<S['theme']> value={s.theme} onChange={(v) => setSettings({ theme: v })}
              options={[{ value: 'light', label: t('settings.light') }, { value: 'dark', label: t('settings.dark') }, { value: 'system', label: t('settings.system') }]} />
          </div>
          <div>
            <span className="label">{t('settings.fontSize')}</span>
            <Segmented<S['fontSize']> value={s.fontSize} onChange={(v) => setSettings({ fontSize: v })}
              options={[{ value: 'sm', label: t('settings.small') }, { value: 'md', label: t('settings.medium') }, { value: 'lg', label: t('settings.large') }]} />
          </div>
        </div>

        <h2 className="section-title">{t('settings.general')}</h2>
        <div className="card divide-y divide-line">
          <label className="flex min-h-14 items-center gap-3 px-4">
            <span className="flex-1 font-semibold">{t('settings.currency')}</span>
            <select className="input w-44" value={s.currency} disabled={locked} onChange={(e) => setSettings({ currency: e.target.value })}>
              <option value="MRU">{lang === 'ar' ? 'أوقية (MRU)' : 'Ouguiya (MRU)'}</option>
              <option value="XOF">FCFA (XOF)</option>
              <option value="EUR">Euro (EUR)</option>
              <option value="USD">Dollar (USD)</option>
            </select>
          </label>
          {locked && <p className="px-4 pb-3 text-xs text-muted">{t('currencies.lockedHint')}</p>}
          <LinkRow to="/settings/currencies" icon={<Coins className="size-5" />} label={t('currencies.title')} hint={s.currencies.map((c) => c.code).join(' · ')} />
          <label className="flex min-h-14 items-center gap-3 px-4">
            <span className="flex-1 font-semibold">{t('settings.weekStart')}</span>
            <select className="input w-44" value={s.weekStartsOn} onChange={(e) => setSettings({ weekStartsOn: Number(e.target.value) as WeekStart })}>
              <option value={1}>{t('days.mon')}</option>
              <option value={6}>{t('days.sat')}</option>
              <option value={0}>{t('days.sun')}</option>
            </select>
          </label>
        </div>

        <h2 className="section-title">{t('settings.reminders')}</h2>
        <div className="card divide-y divide-line">
          <div className="flex min-h-14 items-center gap-3 px-4 py-2">
            <BellRing className="size-5 text-muted" />
            <span className="flex-1"><span className="block font-semibold">{t('settings.dailyReminder')}</span><span className="block text-sm text-muted">{t('settings.dailyReminderHint')}</span></span>
            <Toggle checked={s.reminderEnabled} onChange={(v) => setSettings({ reminderEnabled: v })} label={t('settings.dailyReminder')} />
          </div>
          {s.reminderEnabled && (
            <label className="flex min-h-14 items-center gap-3 px-4">
              <span className="flex-1 font-semibold">{t('settings.reminderHour')}</span>
              <select className="input num w-28" dir="ltr" value={s.reminderHour} onChange={(e) => setSettings({ reminderHour: Number(e.target.value) })}>
                {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
              </select>
            </label>
          )}
          <NotificationsRow />
          <div className="flex min-h-14 items-center gap-3 px-4 py-2">
            <Lightbulb className="size-5 text-muted" />
            <span className="flex-1 font-semibold">{t('settings.insights')}</span>
            <Toggle checked={s.insightsEnabled} onChange={(v) => setSettings({ insightsEnabled: v })} label={t('settings.insights')} />
          </div>
          {s.insightsEnabled && (
            <label className="flex min-h-14 items-center gap-3 px-4">
              <span className="flex-1"><span className="block font-semibold">{t('settings.insightThreshold')}</span><span className="block text-xs text-muted">{t('settings.insightThresholdHint')}</span></span>
              <select className="input num w-24" dir="ltr" value={s.insightThresholdPct} onChange={(e) => setSettings({ insightThresholdPct: Number(e.target.value) })}>
                {[20, 30, 40, 50, 75].map((v) => <option key={v} value={v}>{v}%</option>)}
              </select>
            </label>
          )}
        </div>

        <h2 className="section-title">{t('home.tools')}</h2>
        <div className="card divide-y divide-line overflow-hidden">
          <LinkRow to="/debts" icon={<HandCoins className="size-5" />} label={t('debts.title')} />
          <LinkRow to="/budgets" icon={<Target className="size-5" />} label={t('budgets.title')} />
          <LinkRow to="/goals" icon={<PiggyBank className="size-5" />} label={t('goals.title')} />
          <LinkRow to="/recurring" icon={<Repeat className="size-5" />} label={t('recurring.title')} />
          <LinkRow to="/reconcile" icon={<Scale className="size-5" />} label={t('reconcile.title')} />
          <LinkRow to="/zakat" icon={<Moon className="size-5" />} label={t('zakat.title')} />
        </div>

        <h2 className="section-title">{t('settings.manage')}</h2>
        <div className="card divide-y divide-line overflow-hidden">
          <LinkRow to="/settings/wallets" icon={<Wallet className="size-5" />} label={t('settings.wallets')} />
          <LinkRow to="/settings/categories" icon={<FolderTree className="size-5" />} label={t('settings.categories')} />
          <LinkRow to="/settings/templates" icon={<Zap className="size-5" />} label={t('settings.templates')} />
          <LinkRow to="/settings/trash" icon={<Trash2 className="size-5" />} label={t('settings.trash')} />
        </div>

        <h2 className="section-title">{t('settings.dataSecurity')}</h2>
        <div className="card divide-y divide-line overflow-hidden">
          <LinkRow to="/settings/security" icon={<Lock className="size-5" />} label={t('settings.security')} hint={s.pinHash ? t('security.pinOn', { n: s.pinLength }) : t('security.pinOff')} />
          <LinkRow to="/settings/errors" icon={<Bug className="size-5" />} label={t('errorsPage.title')} hint={errorCount ? t('errorsPage.count', { n: errorCount }) : t('errorsPage.none')} />
          <LinkRow to="/settings/backup" icon={<CloudUpload className="size-5" />} label={t('settings.backup')}
            hint={s.lastBackupAt ? t('backup.last', { date: new Intl.DateTimeFormat(lang === 'ar' ? 'ar-MR-u-nu-latn' : 'fr-FR', { dateStyle: 'medium' }).format(s.lastBackupAt) }) : t('backup.never')} />
          <div className="flex min-h-14 items-center gap-3 px-4 py-2">
            <HardDrive className="size-5 text-muted" />
            <span className="flex-1 text-sm">{isNative ? t('settings.storageApp') : persisted ? t('settings.storagePersisted') : t('settings.storageNotPersisted')}</span>
          </div>
        </div>

        <h2 className="section-title">{t('settings.demo')}</h2>
        <div className="card p-4">
          <p className="mb-3 text-sm text-muted">{t('settings.demoHint')}</p>
          <button className={demo ? 'btn-danger w-full' : 'btn-soft w-full'} disabled={busy} onClick={toggleDemo}>
            {demo ? <Database className="size-4" /> : <FlaskConical className="size-4" />}
            {busy ? '…' : demo ? t('settings.demoClear') : t('settings.demoAdd')}
          </button>
        </div>

        <h2 className="section-title">{t('settings.danger')}</h2>
        <div className="card p-4">
          <p className="mb-3 text-sm text-muted">{t('settings.resetHint')}</p>
          <button className="btn-danger w-full" onClick={() => setResetOpen(true)}><RotateCcw className="size-4" />{t('settings.reset')}</button>
        </div>
        <p className="py-6 text-center text-xs text-muted">{t('app.name')} · <bdi dir="ltr">v{__APP_VERSION__}{__APP_BUILD__ ? ` (${__APP_BUILD__})` : ''}</bdi></p>
        <ResetSheet open={resetOpen} onClose={() => setResetOpen(false)} />
      </div>
    </div>
  );
}

/**
 * "Erase all data and start again": typing a word is the second confirmation. Everything in the
 * database goes (transactions, debts, goals, settings, PIN) and the welcome screen comes back.
 * Backup files already saved outside the app (Documents/Jeybi, Downloads…) are not touched.
 */
function ResetSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setTyped(''); }, [open]);
  const word = t('settings.resetWord');
  const ok = typed.trim().toLocaleLowerCase() === word.toLocaleLowerCase();
  const wipe = async () => {
    setBusy(true);
    try {
      if (isNative) await (await native()).syncNotifications([], '').catch(() => {});
      await wipeAll();
      try {
        for (const k of Object.keys(localStorage)) if (k.startsWith('jeybi:') && k !== 'jeybi:ui') localStorage.removeItem(k);
        sessionStorage.clear();
      } catch { /* storage blocked: nothing else to clear */ }
      location.reload();
    } catch (e) {
      setBusy(false);
      toast({ message: errorMessage(e, t, 'reset'), tone: 'error' });
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title={t('settings.reset')}
      footer={<button className="btn-danger w-full" disabled={!ok || busy} onClick={wipe}><RotateCcw className="size-4" />{t('settings.resetAction')}</button>}>
      <div className="space-y-3">
        <p className="rounded-xl bg-red-600/10 p-3 text-sm text-red-800 dark:text-red-300">{t('settings.resetWarning')}</p>
        <label className="label" htmlFor="reset-word">{t('settings.resetType', { word })}</label>
        <input id="reset-word" className="input" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
      </div>
    </Sheet>
  );
}

/** Android app: real phone notifications (daily reminder, debts due, end of the hawl), even when the app is closed. */
function NativeNotificationsRow() {
  const { t } = useTranslation();
  const s = useSettings();
  const toast = useToast();
  const [granted, setGranted] = useState<boolean | null>(null);
  useEffect(() => { void native().then((n) => n.notificationsGranted()).then(setGranted); }, []);
  const enable = async (on: boolean) => {
    if (!on) { await setSettings({ notificationsEnabled: false }); return; }
    try {
      const n = await native();
      if (!(await n.requestNotifications())) { setGranted(false); toast({ message: t('settings.notificationsDeniedApp'), tone: 'error' }); return; }
      setGranted(true);
      await setSettings({ notificationsEnabled: true });
      await n.testNotification(t('app.name'), t('settings.notificationTest'));
    } catch (e) {
      toast({ message: errorMessage(e, t, 'notify:enable'), tone: 'error' });
    }
  };
  return (
    <div className="flex min-h-14 items-center gap-3 px-4 py-2">
      <span className="flex-1"><span className="block font-semibold">{t('settings.notificationsApp')}</span><span className="block text-xs text-muted">{t('settings.notificationsHintApp')}</span></span>
      <Toggle checked={s.notificationsEnabled && granted !== false} onChange={enable} label={t('settings.notificationsApp')} />
    </div>
  );
}

/** Local notifications: permission + a test. Not reliable when the PWA is closed — the in-app banner is the main reminder. */
function NotificationsRow() {
  if (isNative) return <NativeNotificationsRow />;
  return <WebNotificationsRow />;
}

function WebNotificationsRow() {
  const { t } = useTranslation();
  const s = useSettings();
  const toast = useToast();
  const supported = typeof Notification !== 'undefined' && 'serviceWorker' in navigator;
  if (!supported) return null;
  const enable = async (on: boolean) => {
    if (!on) { await setSettings({ notificationsEnabled: false }); return; }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { toast({ message: t('settings.notificationsDenied'), tone: 'error' }); return; }
    await setSettings({ notificationsEnabled: true });
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification(t('app.name'), { body: t('settings.notificationTest'), icon: 'icons/icon-192.png', lang: document.documentElement.lang, dir: document.documentElement.dir as NotificationDirection });
  };
  return (
    <div className="flex min-h-14 items-center gap-3 px-4 py-2">
      <span className="flex-1"><span className="block font-semibold">{t('settings.notifications')}</span><span className="block text-xs text-muted">{t('settings.notificationsHint')}</span></span>
      <Toggle checked={s.notificationsEnabled && Notification.permission === 'granted'} onChange={enable} label={t('settings.notifications')} />
    </div>
  );
}
