// Debts & loans. A debt row holds the principal; every money movement (the principal leaving or
// entering a wallet, and each repayment) is a transaction of type 'debt', so wallet balances and the
// balance cache stay exact, while income/expense totals never include them.
import { db } from '../data/db';
import type { Debt, DebtDirection, ID, Transaction } from '../data/types';
import { uid } from '../lib/id';
import { log } from './audit';
import { putTx, deleteTxRow } from './flows';
import { paidOf, syncDebtClosure } from './debtSync';
import { MAX_AMOUNT, ValidationError, type Undo } from './transactions';
import { getSettings } from './settings';

const TABLES = () => [db.debts, db.transactions, db.audit, db.meta, db.categories, db.receipts] as const;

export interface DebtInput {
  direction: DebtDirection;
  person: string;
  amount: number;
  date: number;
  dueDate: number | null;
  note: string;
  /** null = record without moving money (a debt from before using the app). */
  walletId: ID | null;
  demo?: boolean;
}

export interface DebtStatus {
  debt: Debt;
  paid: number;
  remaining: number;
  closed: boolean;
  overdue: boolean;
}

/** Money direction of the principal: lending takes money out, borrowing brings it in. */
export const principalFlow = (d: DebtDirection): 'in' | 'out' => (d === 'owed_to_me' ? 'out' : 'in');
/** Repayments go the other way. */
export const repaymentFlow = (d: DebtDirection): 'in' | 'out' => (d === 'owed_to_me' ? 'in' : 'out');

export function debtStatus(debt: Debt, txs: Transaction[], now = Date.now()): DebtStatus {
  const paid = paidOf(debt, txs);
  const remaining = Math.max(0, debt.amount - paid);
  const closed = remaining === 0;
  return { debt, paid, remaining, closed, overdue: !closed && debt.dueDate != null && debt.dueDate < now };
}

export interface DebtSummary { owedToMe: number; iOwe: number; overdue: number; open: number }

export function summarize(statuses: DebtStatus[]): DebtSummary {
  const s: DebtSummary = { owedToMe: 0, iOwe: 0, overdue: 0, open: 0 };
  for (const st of statuses) {
    if (st.closed) continue;
    s.open++;
    if (st.overdue) s.overdue++;
    if (st.debt.direction === 'owed_to_me') s.owedToMe += st.remaining;
    else s.iOwe += st.remaining;
  }
  return s;
}

function movement(debt: Debt, amount: number, flow: 'in' | 'out', walletId: ID, date: number, note: string, now: number, currency: string): Transaction {
  return {
    id: uid(), type: 'debt', amount, walletId, splits: [], categoryIds: [], date, note, tags: [],
    debtId: debt.id, flow, currency, createdAt: now, updatedAt: now, deletedAt: null,
    ...(debt.demo ? { demo: true } : {}),
  };
}

function validate(input: DebtInput) {
  if (!input.person.trim()) throw new ValidationError('person');
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw new ValidationError('amount');
  if (input.amount > MAX_AMOUNT) throw new ValidationError('tooLarge');
}

export async function createDebt(input: DebtInput): Promise<{ debt: Debt; undo: Undo }> {
  validate(input);
  const now = Date.now();
  const debt: Debt = {
    id: uid(), direction: input.direction, person: input.person.trim(), amount: input.amount, date: input.date,
    dueDate: input.dueDate, note: input.note.trim(), walletId: input.walletId, principalTxId: null, closedAt: null,
    createdAt: now, updatedAt: now, ...(input.demo ? { demo: true } : {}),
  };
  await db.transaction('rw', TABLES(), async () => {
    if (input.walletId) {
      const tx = movement(debt, input.amount, principalFlow(input.direction), input.walletId, input.date, debt.note, now, (await getSettings()).currency);
      debt.principalTxId = tx.id;
      await putTx(tx);
      await log(tx.id, 'create', undefined, now);
    }
    await db.debts.add(debt);
  });
  return { debt, undo: () => removeDebt(debt.id).then(() => undefined) };
}

/** Edits the debt; the principal movement follows (amount, wallet, date). */
export async function updateDebt(id: ID, input: DebtInput): Promise<void> {
  validate(input);
  const now = Date.now();
  await db.transaction('rw', TABLES(), async () => {
    const debt = await db.debts.get(id);
    if (!debt) throw new ValidationError('notFound');
    const next: Debt = { ...debt, direction: input.direction, person: input.person.trim(), amount: input.amount, date: input.date,
      dueDate: input.dueDate, note: input.note.trim(), walletId: input.walletId, updatedAt: now };
    const old = debt.principalTxId ? await db.transactions.get(debt.principalTxId) : undefined;
    if (input.walletId) {
      const tx = old
        ? { ...old, amount: input.amount, walletId: input.walletId, date: input.date, flow: principalFlow(input.direction), note: next.note, updatedAt: now }
        : movement(next, input.amount, principalFlow(input.direction), input.walletId, input.date, next.note, now, (await getSettings()).currency);
      next.principalTxId = tx.id;
      await putTx(tx);
    } else if (old) {
      await deleteTxRow(old.id);
      next.principalTxId = null;
    }
    // Direction changed after repayments: the repayments must flow the other way too.
    if (next.direction !== debt.direction) {
      for (const t of await db.transactions.where('debtId').equals(id).toArray()) {
        if (t.id !== next.principalTxId) await putTx({ ...t, flow: repaymentFlow(next.direction), updatedAt: now });
      }
    }
    await db.debts.put(next);
    await syncDebtClosure(id, now);
  });
}

/** Records a (partial) repayment. Cannot exceed what remains. Closes the debt when fully paid. */
export async function addRepayment(debtId: ID, p: { amount: number; walletId: ID; date: number; note?: string }): Promise<{ undo: Undo }> {
  const now = Date.now();
  let txId = '';
  await db.transaction('rw', TABLES(), async () => {
    const debt = await db.debts.get(debtId);
    if (!debt) throw new ValidationError('notFound');
    const st = debtStatus(debt, await db.transactions.where('debtId').equals(debtId).toArray(), now);
    if (!Number.isInteger(p.amount) || p.amount <= 0) throw new ValidationError('amount');
    if (p.amount > MAX_AMOUNT) throw new ValidationError('tooLarge');
    if (p.amount > st.remaining) throw new ValidationError('overpay');
    const tx = movement(debt, p.amount, repaymentFlow(debt.direction), p.walletId, p.date, (p.note ?? '').trim(), now, (await getSettings()).currency);
    txId = tx.id;
    await putTx(tx);
    await log(tx.id, 'create', undefined, now);
    await syncDebtClosure(debtId, now);
  });
  return {
    undo: async () => {
      await db.transaction('rw', TABLES(), async () => {
        await deleteTxRow(txId);
        await db.audit.where('txId').equals(txId).delete();
        await syncDebtClosure(debtId);
      });
    },
  };
}

/** Deletes a debt with all its movements. Returns an undo that puts everything back. */
export async function removeDebt(id: ID): Promise<{ undo: Undo }> {
  let snapshot: { debt: Debt; txs: Transaction[] } | null = null;
  await db.transaction('rw', TABLES(), async () => {
    const debt = await db.debts.get(id);
    if (!debt) return;
    const txs = await db.transactions.where('debtId').equals(id).toArray();
    snapshot = { debt, txs };
    for (const t of txs) await deleteTxRow(t.id);
    await db.debts.delete(id);
  });
  return {
    undo: async () => {
      if (!snapshot) return;
      const s = snapshot as { debt: Debt; txs: Transaction[] };
      await db.transaction('rw', TABLES(), async () => {
        await db.debts.put(s.debt);
        for (const t of s.txs) await putTx(t);
      });
    },
  };
}

export async function listDebts(): Promise<DebtStatus[]> {
  const [debts, txs] = await Promise.all([db.debts.toArray(), db.transactions.where('type').equals('debt').toArray()]);
  const now = Date.now();
  const byDebt = new Map<ID, Transaction[]>();
  for (const t of txs) if (t.debtId) byDebt.set(t.debtId, [...(byDebt.get(t.debtId) ?? []), t]);
  return debts
    .map((d) => debtStatus(d, byDebt.get(d.id) ?? [], now))
    .sort((a, b) => Number(a.closed) - Number(b.closed) || Number(b.overdue) - Number(a.overdue) || (a.debt.dueDate ?? Infinity) - (b.debt.dueDate ?? Infinity) || b.debt.date - a.debt.date);
}

export async function getDebt(id: ID): Promise<{ status: DebtStatus; movements: Transaction[] } | undefined> {
  const debt = await db.debts.get(id);
  if (!debt) return undefined;
  const movements = (await db.transactions.where('debtId').equals(id).toArray()).filter((t) => t.deletedAt == null).sort((a, b) => a.date - b.date);
  return { status: debtStatus(debt, movements), movements };
}

/** Small summary for the home screen — reads only the debts table and debt movements. */
export async function debtSummary(): Promise<DebtSummary> {
  return summarize(await listDebts());
}
