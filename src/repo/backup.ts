import { db } from '../data/db';
import type { AuditEntry, Category, Template, Transaction, Wallet } from '../data/types';
import { DEVICE_ONLY_KEYS, getSettings, setSettings, type Settings } from './settings';
import { rebuildFlows } from './flows';

export const BACKUP_FORMAT = 1;

export interface BackupFile {
  app: 'jeybi';
  format: number;
  exportedAt: number;
  data: {
    wallets: Wallet[];
    categories: Category[];
    transactions: Transaction[];
    templates: Template[];
    audit: AuditEntry[];
    settings: Partial<Settings>;
  };
  receipts: Array<{ id: string; mime: string; createdAt: number; base64: string }>;
}

export interface BackupPreview {
  exportedAt: number;
  transactions: number;
  wallets: number;
  categories: number;
  receipts: number;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function base64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export async function exportBackup(): Promise<BackupFile> {
  const settings = await getSettings();
  const portable: Partial<Settings> = { ...settings };
  for (const k of DEVICE_ONLY_KEYS) delete portable[k];
  const receipts = await db.receipts.toArray();
  return {
    app: 'jeybi',
    format: BACKUP_FORMAT,
    exportedAt: Date.now(),
    data: {
      wallets: await db.wallets.toArray(),
      categories: await db.categories.toArray(),
      transactions: await db.transactions.toArray(),
      templates: await db.templates.toArray(),
      audit: await db.audit.toArray(),
      settings: portable,
    },
    receipts: await Promise.all(receipts.map(async (r) => ({ id: r.id, mime: r.mime, createdAt: r.createdAt, base64: await blobToBase64(r.blob) }))),
  };
}

export class BackupError extends Error {}

export function parseBackup(text: string): { file: BackupFile; preview: BackupPreview } {
  let file: BackupFile;
  try {
    file = JSON.parse(text);
  } catch {
    throw new BackupError('invalidJson');
  }
  const d = file?.data;
  if (file?.app !== 'jeybi' || !d || !Array.isArray(d.wallets) || !Array.isArray(d.categories) || !Array.isArray(d.transactions)) {
    throw new BackupError('notJeybi');
  }
  if (file.format > BACKUP_FORMAT) throw new BackupError('newerFormat');
  return {
    file,
    preview: {
      exportedAt: file.exportedAt,
      transactions: d.transactions.filter((t) => t.deletedAt == null).length,
      wallets: d.wallets.length,
      categories: d.categories.length,
      receipts: file.receipts?.length ?? 0,
    },
  };
}

/** Replaces all data with the backup's content. Device security settings (PIN, biometrics) are kept. */
export async function restoreBackup(file: BackupFile): Promise<void> {
  const d = file.data;
  const receipts = (file.receipts ?? []).map((r) => ({ id: r.id, mime: r.mime, createdAt: r.createdAt, blob: base64ToBlob(r.base64, r.mime) }));
  const keep = await getSettings();
  await db.transaction('rw', [db.wallets, db.categories, db.transactions, db.templates, db.receipts, db.audit, db.meta], async () => {
    await Promise.all([db.wallets.clear(), db.categories.clear(), db.transactions.clear(), db.templates.clear(), db.receipts.clear(), db.audit.clear()]);
    await db.wallets.bulkAdd(d.wallets);
    await db.categories.bulkAdd(d.categories);
    await db.transactions.bulkAdd(d.transactions);
    await db.templates.bulkAdd(d.templates ?? []);
    await db.audit.bulkAdd((d.audit ?? []).map(({ seq: _seq, ...a }) => a));
    await db.receipts.bulkAdd(receipts);
    const device: Partial<Settings> = {};
    for (const k of DEVICE_ONLY_KEYS) (device as Record<string, unknown>)[k] = keep[k];
    await setSettings({ ...d.settings, ...device, onboarded: true, lastBackupAt: file.exportedAt });
    await db.meta.put({ key: 'seeded', value: true });
    await rebuildFlows();
  });
}

export async function markBackupDone() {
  await setSettings({ lastBackupAt: Date.now(), backupBannerSnoozedAt: null });
}
