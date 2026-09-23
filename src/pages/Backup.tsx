import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CloudDownload, CloudUpload, FileJson, TriangleAlert } from 'lucide-react';
import { PageHeader, Sheet } from '../components/ui';
import { useToast } from '../components/Toast';
import { useFmt } from '../hooks/fmt';
import { useSettings } from '../hooks/settings';
import { BackupError, exportBackup, markBackupDone, parseBackup, restoreBackup, type BackupFile, type BackupPreview } from '../repo/backup';
import { fileStamp, shareOrDownload } from '../services/share';

export default function Backup() {
  const { t } = useTranslation();
  const fmt = useFmt();
  const s = useSettings();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ file: BackupFile; preview: BackupPreview } | null>(null);

  const doExport = async () => {
    setBusy(true);
    try {
      const data = await exportBackup();
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      const res = await shareOrDownload(blob, `jeybi-backup-${fileStamp()}.json`, t('backup.shareTitle'));
      if (res !== 'cancelled') {
        await markBackupDone();
        toast({ message: res === 'shared' ? t('backup.shared') : t('backup.downloaded') });
      }
    } catch (e) {
      toast({ message: String(e), tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      setPending(parseBackup(await f.text()));
    } catch (e) {
      toast({ message: e instanceof BackupError ? t(`backup.errors.${e.message}`) : String(e), tone: 'error' });
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
      toast({ message: String(e), tone: 'error' });
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
          <p className="text-sm text-muted">{t('backup.exportHint')}</p>
          <p className="text-sm">{s.lastBackupAt ? t('backup.last', { date: fmt.date(s.lastBackupAt, 'dateTime') }) : t('backup.never')}</p>
          <button className="btn-primary w-full" disabled={busy} onClick={doExport}><CloudUpload className="size-5" />{t('backup.exportAction')}</button>
        </div>

        <div className="card space-y-3 p-4">
          <div className="flex items-center gap-3">
            <CloudDownload className="size-6 text-teal-700 dark:text-teal-400" />
            <h2 className="text-lg font-bold">{t('backup.importTitle')}</h2>
          </div>
          <p className="text-sm text-muted">{t('backup.importHint')}</p>
          <label className="btn-soft w-full cursor-pointer">
            <FileJson className="size-5" />{t('backup.chooseFile')}
            <input type="file" accept="application/json,.json" className="hidden" onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
        </div>
      </div>

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

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between px-4 py-3">
      <span className="text-muted">{label}</span>
      <span className="num font-semibold">{value}</span>
    </div>
  );
}
