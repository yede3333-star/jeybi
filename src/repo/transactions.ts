import { db } from '../data/db';
import type { ID, Split, Transaction, TxType } from '../data/types';
import { uid } from '../lib/id';
import { diffTx, log } from './audit';
import { getSettings, setSettings } from './settings';
import { ensureFeesCategory } from './categories';
import { deleteTxRow, patchTx, putTx } from './flows';
import { toBase } from '../services/currency';
import { syncDebtClosure } from './debtSync';

export interface TxInput {
  type: TxType;
  amount: number;
  walletId: ID;
  toWalletId?: ID;
  /** Either splits, or a single categoryId. */
  splits?: Split[];
  categoryId?: ID;
  date: number;
  note?: string;
  tags?: string[];
  receiptId?: ID | null;
  /** Transfers only: optional fee, recorded as a separate expense in the "fees" category. */
  fee?: number;
  templateId?: ID;
  /** Foreign currency: original amount/currency and rate; `amount` must equal toBase(origAmount, rateE4). */
  origCurrency?: string;
  origAmount?: number;
  rateE4?: number;
  recurringKey?: string;
  adjustment?: boolean;
  sourceText?: string;
  demo?: boolean;
}

/**
 * Largest amount accepted anywhere (minor units): 10^14 = 1,000,000,000,000 (a trillion) in base
 * currency. Keeps every sum far inside JavaScript's safe integer range, even after currency conversion.
 */
export const MAX_AMOUNT = 100_000_000_000_000;

export class ValidationError extends Error {
  constructor(public code: string) { super(code); }
}

/** An operation's inverse, used by the "Undo" toast. */
export type Undo = () => Promise<void>;

export function normalizeTag(tag: string): string {
  return tag.trim().replace(/^#+/, '').replace(/\s+/g, '_').replace(/[,،]+$/, '');
}

function validate(input: TxInput): Split[] {
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw new ValidationError('amount');
  if (input.amount > MAX_AMOUNT || (input.fee ?? 0) > MAX_AMOUNT || (input.origAmount ?? 0) > MAX_AMOUNT) throw new ValidationError('tooLarge');
  if (input.origCurrency) {
    const { origAmount, rateE4 } = input;
    if (!Number.isInteger(origAmount) || origAmount! <= 0 || !Number.isInteger(rateE4) || rateE4! <= 0) throw new ValidationError('rate');
    if (toBase(origAmount!, rateE4!) !== input.amount) throw new ValidationError('rate');
  }
  if (input.type === 'debt') throw new ValidationError('debtViaDebts');
  if (!input.walletId) throw new ValidationError('wallet');
  if (input.type === 'transfer') {
    if (!input.toWalletId || input.toWalletId === input.walletId) throw new ValidationError('transferWallets');
    if (input.fee != null && (!Number.isInteger(input.fee) || input.fee < 0)) throw new ValidationError('fee');
    return [];
  }
  const splits = input.splits?.length
    ? input.splits
    : input.categoryId ? [{ categoryId: input.categoryId, amount: input.amount }] : [];
  if (!splits.length) throw new ValidationError('category');
  if (splits.some((s) => !s.categoryId || !Number.isInteger(s.amount) || s.amount <= 0)) throw new ValidationError('split');
  const sum = splits.reduce((a, s) => a + s.amount, 0);
  if (sum !== input.amount) throw new ValidationError('splitSum');
  // merge duplicate categories
  const merged = new Map<ID, number>();
  for (const s of splits) merged.set(s.categoryId, (merged.get(s.categoryId) ?? 0) + s.amount);
  return [...merged.entries()].map(([categoryId, amount]) => ({ categoryId, amount }));
}

function build(input: TxInput, splits: Split[], base: Partial<Transaction>, now: number, currency: string): Transaction {
  return {
    id: base.id ?? uid(),
    type: input.type,
    amount: input.amount,
    walletId: input.walletId,
    ...(input.type === 'transfer' ? { toWalletId: input.toWalletId } : {}),
    splits,
    categoryIds: splits.map((s) => s.categoryId),
    date: input.date,
    note: (input.note ?? '').trim(),
    tags: [...new Set((input.tags ?? []).map(normalizeTag).filter(Boolean))],
    ...(input.receiptId ? { receiptId: input.receiptId } : {}),
    ...(base.transferId ? { transferId: base.transferId } : {}),
    ...(input.templateId ?? base.templateId ? { templateId: input.templateId ?? base.templateId } : {}),
    ...(input.origCurrency ? { origCurrency: input.origCurrency, origAmount: input.origAmount, rateE4: input.rateE4 } : {}),
    ...(input.recurringKey ?? base.recurringKey ? { recurringKey: input.recurringKey ?? base.recurringKey } : {}),
    ...(input.adjustment || base.adjustment ? { adjustment: true } : {}),
    ...(input.sourceText ?? base.sourceText ? { sourceText: input.sourceText ?? base.sourceText } : {}),
    currency: base.currency ?? currency,
    ...(input.demo || base.demo ? { demo: true } : {}),
    createdAt: base.createdAt ?? now,
    updatedAt: now,
    deletedAt: base.deletedAt ?? null,
  };
}

const TABLES = () => [db.transactions, db.audit, db.meta, db.categories, db.receipts, db.debts] as const;

function feeTx(transfer: Transaction, fee: number, feesCategoryId: ID, now: number, existing?: Transaction): Transaction {
  return {
    id: existing?.id ?? uid(),
    type: 'expense',
    amount: fee,
    walletId: transfer.walletId,
    splits: [{ categoryId: feesCategoryId, amount: fee }],
    categoryIds: [feesCategoryId],
    date: transfer.date,
    note: existing?.note ?? transfer.note,
    tags: transfer.tags,
    transferId: transfer.id,
    currency: transfer.currency,
    ...(transfer.demo ? { demo: true } : {}),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    deletedAt: null,
  };
}

export async function createTransaction(input: TxInput): Promise<{ tx: Transaction; undo: Undo }> {
  const splits = validate(input);
  const now = Date.now();
  const tx = await db.transaction('rw', TABLES(), async () => {
    const { currency } = await getSettings();
    const tx = build(input, splits, {}, now, currency);
    if (tx.type === 'transfer' && input.fee && input.fee > 0) {
      const fees = await ensureFeesCategory();
      const f = feeTx(tx, input.fee, fees.id, now);
      tx.feeTxId = f.id;
      await putTx(f);
      await log(f.id, 'create', undefined, now);
    }
    await putTx(tx);
    await log(tx.id, 'create', undefined, now);
    if (!input.demo) await setSettings({ lastWalletId: tx.walletId });
    return tx;
  });
  return { tx, undo: () => purgeTransaction(tx.id) };
}

export async function getTransaction(id: ID): Promise<Transaction | undefined> {
  return db.transactions.get(id);
}

/** Fee amount currently attached to a transfer (0 if none or deleted). */
export async function feeOf(tx: Transaction): Promise<number> {
  if (tx.type !== 'transfer' || !tx.feeTxId) return 0;
  const f = await db.transactions.get(tx.feeTxId);
  return f && f.deletedAt == null ? f.amount : 0;
}

export async function updateTransaction(id: ID, input: TxInput): Promise<{ tx: Transaction; undo: Undo }> {
  const splits = validate(input);
  const now = Date.now();
  return db.transaction('rw', TABLES(), async () => {
    const before = await db.transactions.get(id);
    if (!before) throw new ValidationError('notFound');
    const beforeFee = before.feeTxId ? await db.transactions.get(before.feeTxId) : undefined;
    const tx = build(input, splits, before, now, before.currency);
    let createdFeeId: ID | null = null;

    const wantFee = tx.type === 'transfer' ? (input.fee ?? (beforeFee?.deletedAt == null ? beforeFee?.amount ?? 0 : 0)) : 0;
    if (wantFee > 0) {
      const fees = await ensureFeesCategory();
      const f = feeTx(tx, wantFee, fees.id, now, beforeFee);
      tx.feeTxId = f.id;
      if (beforeFee) {
        const ch = diffTx(beforeFee, f);
        if (ch.length || beforeFee.deletedAt != null) {
          await putTx(f);
          await log(f.id, beforeFee.deletedAt != null ? 'restore' : 'update', ch, now);
        }
      } else {
        createdFeeId = f.id;
        await putTx(f);
        await log(f.id, 'create', undefined, now);
      }
    } else if (beforeFee && beforeFee.deletedAt == null) {
      await putTx({ ...beforeFee, deletedAt: now, updatedAt: now });
      await log(beforeFee.id, 'delete', undefined, now);
      tx.feeTxId = beforeFee.id;
    } else if (beforeFee) {
      tx.feeTxId = beforeFee.id;
    }

    const changes = diffTx(before, tx);
    await putTx(tx);
    if (changes.length) await log(id, 'update', changes, now);

    const undo: Undo = async () => {
      await db.transaction('rw', TABLES(), async () => {
        const current = await db.transactions.get(id);
        if (current) {
          const back = { ...before, updatedAt: Date.now() };
          await putTx(back);
          const ch = diffTx(current, back);
          if (ch.length) await log(id, 'update', ch);
        }
        if (beforeFee) await putTx(beforeFee);
        if (createdFeeId) {
          await deleteTxRow(createdFeeId);
          await db.audit.where('txId').equals(createdFeeId).delete();
        }
      });
    };
    return { tx, undo };
  });
}

/** Soft delete (moves to the trash). A transfer takes its fee with it. */
export async function deleteTransaction(id: ID): Promise<{ undo: Undo }> {
  const now = Date.now();
  await db.transaction('rw', TABLES(), async () => {
    const tx = await db.transactions.get(id);
    if (!tx || tx.deletedAt != null) return;
    await patchTx(id, { deletedAt: now, updatedAt: now });
    await log(id, 'delete', undefined, now);
    await syncDebtClosure(tx.debtId, now);
    if (tx.feeTxId) {
      const f = await db.transactions.get(tx.feeTxId);
      if (f && f.deletedAt == null) {
        await patchTx(f.id, { deletedAt: now, updatedAt: now });
        await log(f.id, 'delete', undefined, now);
      }
    }
  });
  return { undo: () => restoreTransaction(id, now) };
}

/**
 * Restores from the trash. `deletedAt` (optional) limits the linked fee restore to the fee
 * that was deleted together with the transfer.
 */
export async function restoreTransaction(id: ID, deletedAt?: number): Promise<void> {
  const now = Date.now();
  await db.transaction('rw', TABLES(), async () => {
    const tx = await db.transactions.get(id);
    if (!tx || tx.deletedAt == null) return;
    const when = tx.deletedAt;
    await patchTx(id, { deletedAt: null, updatedAt: now });
    await log(id, 'restore', undefined, now);
    await syncDebtClosure(tx.debtId, now);
    if (tx.feeTxId) {
      const f = await db.transactions.get(tx.feeTxId);
      if (f && f.deletedAt != null && f.deletedAt === (deletedAt ?? when)) {
        await patchTx(f.id, { deletedAt: null, updatedAt: now });
        await log(f.id, 'restore', undefined, now);
      }
    }
  });
}

/** Permanent delete: the transaction, its fee, its receipt image and its history. */
export async function purgeTransaction(id: ID): Promise<void> {
  await db.transaction('rw', TABLES(), async () => {
    const tx = await db.transactions.get(id);
    if (!tx) return;
    const ids = [id, ...(tx.feeTxId ? [tx.feeTxId] : [])];
    for (const tid of ids) {
      const t = await db.transactions.get(tid);
      if (t?.receiptId) await db.receipts.delete(t.receiptId);
      await deleteTxRow(tid);
      await db.audit.where('txId').equals(tid).delete();
    }
    if (tx.transferId) {
      const parent = await db.transactions.get(tx.transferId);
      if (parent?.feeTxId === id) await patchTx(parent.id, { feeTxId: undefined });
    }
    await syncDebtClosure(tx.debtId);
  });
}

export async function emptyTrash(): Promise<void> {
  const deleted = await db.transactions.filter((t) => t.deletedAt != null).primaryKeys();
  for (const id of deleted) await purgeTransaction(id);
}

export async function listActive(): Promise<Transaction[]> {
  const all = await db.transactions.orderBy('date').reverse().toArray();
  return all.filter((t) => t.deletedAt == null);
}

export async function listDeleted(): Promise<Transaction[]> {
  const all = await db.transactions.filter((t) => t.deletedAt != null).toArray();
  return all.sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));
}

/** Previously used tags, most frequent first. */
export async function allTags(): Promise<string[]> {
  const counts = new Map<string, number>();
  await db.transactions.each((t) => {
    if (t.deletedAt != null) return;
    for (const tg of t.tags) counts.set(tg, (counts.get(tg) ?? 0) + 1);
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
}

export async function countUsage(field: 'walletId' | 'categoryIds', id: ID): Promise<number> {
  if (field === 'walletId') {
    const a = await db.transactions.where('walletId').equals(id).count();
    const b = await db.transactions.where('toWalletId').equals(id).count();
    return a + b;
  }
  return db.transactions.where('categoryIds').equals(id).count();
}
