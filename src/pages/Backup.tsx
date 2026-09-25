import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CloudDownload, CloudUpload, FileJson, FolderClock, KeyRound, Loader2, Share2, TriangleAlert } from 'lucide-react';
import { PageHeader, Sheet } from '../components/ui';
import { useToast } from '../components/Toast';
import { useFmt } from '../hooks/fmt';
import { useSettings } from '../hooks/settings';
import {
  decryptBackup, exportEncryptedBackup, markBackupDone, openBackupText, restoreBackup,
  type BackupFile, type BackupPreview,
} from '../repo/backup';
import { makeAutoBackup } from '../repo/phone';
import { setSettings } from '../repo/settings';
import { deriveBackupKey, MIN_BACKUP_PASSWORD, type EncryptedBackup } from '../services/backupCrypto';
import { fileStamp } from '../services/share';
import { errorMessage } from '../services/errors';
import { useFileShare } from '../components/FileShare';
import { AUTO_BACKUP_FOLDER, isNative, native } from '../platform';
import type { AutoBackupFile } from '../platform/native';

export default function Backup() {
  const { t } = useTranslation();
  const fmt = useFmt();
  const s = useSettings();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [askExport, setAskExport] = useState(false);
  const [locked, setLocked] = useState<EncryptedBackup | null>(null);
  const [pending, setPending] = useState<{ file: BackupFile; preview: BackupPreview } | null>(null);
  const fileShare = useFileShare();

  // Step 1 prepares the (encrypted) file; the share/download buttons in the sheet then run inside the user's tap.
  const doExport = (password: string) => {
    setAskExport(false);
    fileShare(async () => {
      const text = await exportEncryptedBackup(password);
      return {
        blob: new Blob([text], { type: 'application/json' }),
        filename: `jeybi-backup-${fileStamp()}.json`,
        title: t('backup.shareTitle'),
        // Chrome on Android only shares allow-listed types: .json is refused, plain text is accepted.
        shareAs: { filename: `jeybi-backup-${fileStamp()}.txt`, type: 'text/plain' },
      };
    }, () => { void markBackupDone(); });
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      const opened = openBackupText(await f.text());
      if (opened.kind === 'encrypted') setLocked(opened.envelope);
      else setPending({ file: opened.file, preview: opened.preview });
    } catch (e) {
      toast({ message: errorMessage(e, t, 'backup:read'), tone: 'error' });
    }
  };

  const doImport = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      await restoreBackup(pending.file);
      setPending(null);
      toast({ message: t('backup.restored') });
    } catch (e) {
      toast({ message: errorMessage(e, t, 'backup:restore'), tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader back title={t('settings.backup')} />
      <div className="space-y-4 px-4">
        <div className="card space-y-3 p-4">
          <div className="flex items-center gap-3">
            <CloudUpload className="size-6 text-teal-700 dark:text-teal-400" />
            <h2 className="text-lg font-bold">{t('backup.exportTitle')}</h2>
          </div>
          <p className="text-sm text-muted">{t(isNative ? 'backup.exportHintApp' : 'backup.exportHint')}</p>
          <p className="text-sm">{s.lastBackupAt ? t('backup.last', { date: fmt.date(s.lastBackupAt, 'dateTime') }) : t('backup.never')}</p>
          <button className="btn-primary w-full" disabled={busy} onClick={() => setAskExport(true)}><CloudUpload className="size-5" />{t('backup.exportAction')}</button>
        </div>

        {isNative && <AutoBackupCard />}

        <div className="card space-y-3 p-4">
          <div className="flex items-center gap-3">
            <CloudDownload className="size-6 text-teal-700 dark:text-teal-400" />
            <h2 className="text-lg font-bold">{t('backup.importTitle')}</h2>
          </div>
          <p className="text-sm text-muted">{t('backup.importHint')}</p>
          <label className="btn-soft w-full cursor-pointer">
            <FileJson className="size-5" />{t('backup.chooseFile')}
            {/* Android app: no filter — a file received on WhatsApp often has no usable type, and the
                system picker would grey it out. The content is checked after reading. */}
            <input type="file" {...(isNative ? {} : { accept: 'application/json,.json,text/plain,.txt' })} className="hidden"
              onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
        </div>
      </div>

      <PasswordSheet open={askExport} onClose={() => setAskExport(false)} mode="export" onDone={doExport} />

      <UnlockSheet envelope={locked} onClose={() => setLocked(null)} onOpened={(r) => { setLocked(null); setPending(r); }} />

      <Sheet open={!!pending} onClose={() => setPending(null)} title={t('backup.previewTitle')}
        footer={<button className="btn-danger w-full" disabled={busy} onClick={doImport}>{t('backup.replaceAction')}</button>}>
        {pending && (
          <div className="space-y-3">
            <div className="card divide-y divide-line">
              <Line label={t('backup.date')} value={fmt.date(pending.preview.exportedAt, 'dateTime')} />
              <Line label={t('backup.transactions')} value={String(pending.preview.transactions)} />
              <Line label={t('settings.wallets')} value={String(pending.preview.wallets)} />
              <Line label={t('settings.categories')} value={String(pending.preview.categories)} />
              <Line label={t('backup.receipts')} value={String(pending.preview.receipts)} />
            </div>
            <p className="flex gap-2 rounded-xl bg-red-600/10 p-3 text-sm text-red-800 dark:text-red-300">
              <TriangleAlert className="size-5 shrink-0" />{t('backup.replaceWarning')}
            </p>
          </div>
        )}
      </Sheet>
    </div>
  );
}

/** Chooses a password (typed twice), with the "cannot be recovered" warning. */
function PasswordSheet({ open, onClose, mode, onDone }: {
  open: boolean; onClose: () => void; mode: 'export' | 'auto'; onDone: (password: string) => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setPw(''); setPw2(''); setBusy(false); } }, [open]);
  const tooShort = pw.length < MIN_BACKUP_PASSWORD;
  const mismatch = pw2.length > 0 && pw !== pw2;
  const ok = !tooShort && pw === pw2;
  return (
    <Sheet open={open} onClose={onClose} title={t(mode === 'export' ? 'backup.passwordTitle' : 'autoBackup.passwordTitle')}
      footer={
        <button className="btn-primary w-full" disabled={!ok || busy} onClick={async () => { setBusy(true); try { await onDone(pw); } finally { setBusy(false); } }}>
          {busy ? <Loader2 className="size-5 animate-spin" /> : <KeyRound className="size-5" />}
          {t(mode === 'export' ? 'backup.encryptAction' : 'autoBackup.enableAction')}
        </button>
      }>
      <div className="space-y-3">
        <p className="text-sm text-muted">{t(mode === 'export' ? 'backup.passwordHint' : 'autoBackup.passwordHint')}</p>
        <div>
          <label className="label" htmlFor="bpw">{t('backup.password')}</label>
          <input id="bpw" className="input" type="password" autoComplete="new-password" dir="ltr" value={pw} onChange={(e) => setPw(e.target.value)} />
          {pw.length > 0 && tooShort && <p className="mt-1 text-xs text-expense">{t('backup.passwordTooShort', { n: MIN_BACKUP_PASSWORD })}</p>}
        </div>
        <div>
          <label className="label" htmlFor="bpw2">{t('backup.passwordRepeat')}</label>
          <input id="bpw2" className="input" type="password" autoComplete="new-password" dir="ltr" value={pw2} onChange={(e) => setPw2(e.target.value)} />
          {mismatch && <p className="mt-1 text-xs text-expense">{t('backup.passwordMismatch')}</p>}
        </div>
        <p className="flex gap-2 rounded-xl bg-amber-100 p-3 text-sm font-semibold text-amber-900 dark:bg-amber-400/15 dark:text-amber-200">
          <TriangleAlert className="size-5 shrink-0" />{t('backup.passwordWarning')}
        </p>
      </div>
    </Sheet>
  );
}

/** Asks the password of an encrypted file; a wrong password changes nothing. */
function UnlockSheet({ envelope, onClose, onOpened }: {
  envelope: EncryptedBackup | null; onClose: () => void; onOpened: (r: { file: BackupFile; preview: BackupPreview }) => void;
}) {
  const { t } = useTranslation();
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setPw(''); setError(null); setBusy(false); }, [envelope]);
  const submit = async () => {
    if (!envelope || !pw) return;
    setBusy(true);
    setError(null);
    try {
      onOpened(await decryptBackup(envelope, pw));
    } catch (e) {
      setError(errorMessage(e, t, 'backup:decrypt'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open={!!envelope} onClose={onClose} title={t('backup.unlockTitle')}
      footer={<button className="btn-primary w-full" disabled={!pw || busy} onClick={submit}>{busy ? <Loader2 className="size-5 animate-spin" /> : <KeyRound className="size-5" />}{t('backup.unlockAction')}</button>}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <p className="text-sm text-muted">{t('backup.unlockHint')}</p>
        <input className="input" type="password" autoComplete="current-password" dir="ltr" autoFocus value={pw} onChange={(e) => { setPw(e.target.value); setError(null); }} aria-label={t('backup.password')} />
        {error && <p className="rounded-xl bg-red-600/10 p-3 text-sm font-semibold text-red-700 dark:text-red-300" role="alert">{error}</p>}
      </form>
    </Sheet>
  );
}

/** Android: weekly encrypted copy in Documents/Jeybi (kept when the app is uninstalled), last 4 kept. */
function AutoBackupCard() {
  const { t } = useTranslation();
  const fmt = useFmt();
  const s = useSettings();
  const toast = useToast();
  const [files, setFiles] = useState<AutoBackupFile[] | null>(null);
  const [setup, setSetup] = useState(false);
  const [busy, setBusy] = useState(false);
  const on = !!s.autoBackupKey;

  const refresh = useCallback(() => { void native().then((n) => n.listAutoBackups()).then(setFiles, () => setFiles([])); }, []);
  useEffect(refresh, [refresh, s.lastAutoBackupAt]);

  const backupNow = async () => {
    setBusy(true);
    try {
      const n = await native();
      await makeAutoBackup((text, stamp) => n.writeAutoBackup(text, stamp));
      toast({ message: t('autoBackup.saved', { folder: AUTO_BACKUP_FOLDER }) });
    } catch (e) {
      toast({ message: `${t('autoBackup.failed')} ${errorMessage(e, t, 'autoBackup:now')}`, tone: 'error' });
    } finally {
      setBusy(false);
      refresh();
    }
  };

  const enable = async (password: string) => {
    const key = await deriveBackupKey(password);
    await setSettings({ autoBackupKey: key });
    setSetup(false);
    await backupNow(); // first copy right away (and Android ≤ 10 asks for storage access now, not later)
  };

  const share = async (f: AutoBackupFile) => {
    try {
      const r = await (await native()).shareAutoBackup(f, t('backup.shareTitle'));
      if (r === 'shared') await markBackupDone();
    } catch (e) {
      toast({ message: errorMessage(e, t, 'autoBackup:share'), tone: 'error' });
    }
  };

  return (
    <div className="card space-y-3 p-4">
      <div className="flex items-center gap-3">
        <FolderClock className="size-6 text-teal-700 dark:text-teal-400" />
        <h2 className="flex-1 text-lg font-bold">{t('autoBackup.title')}</h2>
      </div>
      <p className="text-sm text-muted">{t('autoBackup.hint', { folder: AUTO_BACKUP_FOLDER })}</p>
      {!on ? (
        <button className="btn-soft w-full" onClick={() => setSetup(true)}><KeyRound className="size-5" />{t('autoBackup.setup')}</button>
      ) : (
        <>
          <p className="text-sm">{s.lastAutoBackupAt ? t('autoBackup.last', { date: fmt.date(s.lastAutoBackupAt, 'dateTime') }) : t('backup.never')}</p>
          {files && files.length > 0 && (
            <div className="divide-y divide-line rounded-xl ring-1 ring-line">
              {files.map((f) => (
                <div key={f.name} className="flex items-center gap-2 px-3 py-2">
                  <bdi dir="ltr" className="min-w-0 flex-1 truncate text-sm">{f.name}</bdi>
                  <button className="btn-ghost min-h-10 px-3 text-sm" onClick={() => void share(f)} aria-label={t('share.shareNow')}><Share2 className="size-4" /></button>
                </div>
              ))}
            </div>
          )}
          <button className="btn-primary w-full" disabled={busy} onClick={backupNow}>
            {busy ? <Loader2 className="size-5 animate-spin" /> : <FolderClock className="size-5" />}{t('autoBackup.now')}
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button className="btn-soft text-sm" onClick={() => setSetup(true)}>{t('autoBackup.changePassword')}</button>
            <button className="btn-danger text-sm" onClick={() => void setSettings({ autoBackupKey: null })}>{t('autoBackup.turnOff')}</button>
          </div>
          <p className="text-xs text-muted">{t('autoBackup.changeNote')}</p>
        </>
      )}
      <PasswordSheet open={setup} onClose={() => setSetup(false)} mode="auto" onDone={enable} />
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between px-4 py-3">
      <span className="text-muted">{label}</span>
      <span className="num font-semibold">{value}</span>
    </div>
  );
}
