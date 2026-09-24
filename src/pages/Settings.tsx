import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  BellRing, Coins, HandCoins, Lightbulb, Moon, PiggyBank, Repeat, Scale, Target,
  ChevronLeft, CloudUpload, Database, FlaskConical, FolderTree, HardDrive, Lock, RotateCcw, Trash2, Wallet, Zap,
} from 'lucide-react';
import { PageHeader, Segmented } from '../components/ui';
import { useToast } from '../components/Toast';
import { useLang, useSettings } from '../hooks/settings';
import { setSettings, type Settings as S } from '../repo/settings';
import { addDemoData, clearDemoData, hasDemoData } from '../repo/demo';
import { wipeAll } from '../repo/init';
import { hasTransactions } from '../repo/summary';
import { Toggle } from '../components/ui';
import type { WeekStart } from '../lib/period';

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

  useEffect(() => { void navigator.storage?.persisted?.().then(setPersisted); }, []);

  const toggleDemo = async () => {
    setBusy(true);
    try {
      if (demo) toast({ message: t('settings.demoCleared', { n: await clearDemoData() }) });
      else toast({ message: t('settings.demoAdded', { n: await addDemoData(lang) }) });
    } catch (e) {
      toast({ message: String(e), tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (!confirm(t('settings.resetConfirm1'))) return;
    if (!confirm(t('settings.resetConfirm2'))) return;
    await wipeAll();
    location.reload();
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
          <LinkRow to="/settings/backup" icon={<CloudUpload className="size-5" />} label={t('settings.backup')}
            hint={s.lastBackupAt ? t('backup.last', { date: new Intl.DateTimeFormat(lang === 'ar' ? 'ar-MR-u-nu-latn' : 'fr-FR', { dateStyle: 'medium' }).format(s.lastBackupAt) }) : t('backup.never')} />
          <div className="flex min-h-14 items-center gap-3 px-4 py-2">
            <HardDrive className="size-5 text-muted" />
            <span className="flex-1 text-sm">{persisted ? t('settings.storagePersisted') : t('settings.storageNotPersisted')}</span>
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
          <button className="btn-danger w-full" onClick={reset}><RotateCcw className="size-4" />{t('settings.reset')}</button>
        </div>
        <p className="py-6 text-center text-xs text-muted">{t('app.name')} · v{__APP_VERSION__}</p>
      </div>
    </div>
  );
}

/** Local notifications: permission + a test. Not reliable when the PWA is closed — the in-app banner is the main reminder. */
function NotificationsRow() {
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
