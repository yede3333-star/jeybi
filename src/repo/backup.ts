import { db } from '../data/db';
import type {
  AuditEntry, Budget, Category, Debt, Goal, GoalMove, PendingOccurrence, Recurring, Template, Transaction, Wallet,
} from '../data/types';
import { missingSystemCategories } from '../data/defaults';
import { DEVICE_ONLY_KEYS, getSettings, setSettings, type Settings } from './settings';
import { rebuildFlows } from './flows';

/**
 * 1 = phase 1 (wallets, categories, transactions, templates, audit, receipts, settings).
 * 2 = phase 2: + debts, budgets, recurring, pending, goals, goalMoves. Format-1 files stay importable.
 */
export const BACKUP_FORMAT = 2;

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
    // format 2
    debts?: Debt[];
    budgets?: Budget[];
    recurring?: Recurring[];
    pending?: PendingOccurrence[];
    goals?: Goal[];
    goalMoves?: GoalMove[];
  };
  receipts: Array<{ id: string; mime: string; createdAt: number; base64: string }>;
}

export interface BackupPreview {
  exportedAt: number;
  format: number;
  transactions: number;
  wallets: number;
  categories: number;
  receipts: number;
  debts: number;
  goals: number;
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

/** Every table a backup replaces (meta is merged, not cleared, to keep device settings). */
const DATA_TABLES = () => [
  db.wallets, db.categories, db.transactions, db.templates, db.receipts, db.audit,
  db.debts, db.budgets, db.recurring, db.pending, db.goals, db.goalMoves,
];

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
      debts: await db.debts.toArray(),
      budgets: await db.budgets.toArray(),
      recurring: await db.recurring.toArray(),
      pending: await db.pending.toArray(),
      goals: await db.goals.toArray(),
      goalMoves: await db.goalMoves.toArray(),
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
  if (!(file.format >= 1) || file.format > BACKUP_FORMAT) throw new BackupError('newerFormat');
  return {
    file,
    preview: {
      exportedAt: file.exportedAt,
      format: file.format,
      transactions: d.transactions.filter((t) => t.deletedAt == null).length,
      wallets: d.wallets.length,
      categories: d.categories.length,
      receipts: file.receipts?.length ?? 0,
      debts: d.debts?.length ?? 0,
      goals: d.goals?.length ?? 0,
    },
  };
}

/**
 * Replaces all data with the backup's content (format 1 or 2). Device security settings (PIN,
 * biometrics) are kept. A phase-1 file simply has no debts/budgets/…; the phase-2 system
 * categories are added exactly like the database migration does.
 */
export async function restoreBackup(file: BackupFile): Promise<void> {
  const d = file.data;
  const receipts = (file.receipts ?? []).map((r) => ({ id: r.id, mime: r.mime, createdAt: r.createdAt, blob: base64ToBlob(r.base64, r.mime) }));
  const keep = await getSettings();
  await db.transaction('rw', [...DATA_TABLES(), db.meta], async () => {
    await Promise.all(DATA_TABLES().map((t) => t.clear()));
    await db.wallets.bulkAdd(d.wallets);
    await db.categories.bulkAdd([...d.categories, ...missingSystemCategories(d.categories)]);
    await db.transactions.bulkAdd(d.transactions);
    await db.templates.bulkAdd(d.templates ?? []);
    await db.audit.bulkAdd((d.audit ?? []).map(({ seq: _seq, ...a }) => a));
    await db.receipts.bulkAdd(receipts);
    await db.debts.bulkAdd(d.debts ?? []);
    await db.budgets.bulkAdd(d.budgets ?? []);
    await db.recurring.bulkAdd(d.recurring ?? []);
    await db.pending.bulkAdd(d.pending ?? []);
    await db.goals.bulkAdd(d.goals ?? []);
    await db.goalMoves.bulkAdd(d.goalMoves ?? []);
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
