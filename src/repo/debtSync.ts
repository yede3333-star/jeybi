// Keeps a debt's `closedAt` in step with its payments. Lives apart from debts.ts so that the
// transaction repo can call it (deleting/restoring a repayment from the trash) without an import cycle.
import { db } from '../data/db';
import type { Debt, ID, Transaction } from '../data/types';

/** Sum of live repayments (the principal movement is not a repayment). */
export function paidOf(debt: Debt, txs: Transaction[]): number {
  return txs
    .filter((t) => t.deletedAt == null && t.debtId === debt.id && t.id !== debt.principalTxId)
    .reduce((a, t) => a + t.amount, 0);
}

/** Recomputes open/closed for a debt. Call inside a transaction that includes debts + transactions. */
export async function syncDebtClosure(debtId: ID | undefined, now = Date.now()): Promise<void> {
  if (!debtId) return;
  const debt = await db.debts.get(debtId);
  if (!debt) return;
  const paid = paidOf(debt, await db.transactions.where('debtId').equals(debtId).toArray());
  const closed = paid >= debt.amount;
  if (closed && debt.closedAt == null) await db.debts.update(debtId, { closedAt: now, updatedAt: now });
  else if (!closed && debt.closedAt != null) await db.debts.update(debtId, { closedAt: null, updatedAt: now });
}
