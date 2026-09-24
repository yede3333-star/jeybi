// Balance reconciliation: compare what the app recorded with the real balance (Bankily app, cash
// in the pocket…), and optionally record the difference as an "unrecorded" expense/income.
import { db } from '../data/db';
import type { ID, Wallet } from '../data/types';
import { getBalances } from './summary';
import { createTransaction, type Undo } from './transactions';

export const RECONCILE_EVERY_DAYS = 14;
const DAY = 86_400_000;

export async function recordedBalance(walletId: ID): Promise<number> {
  return (await getBalances()).byWallet.get(walletId) ?? 0;
}

/**
 * @param real   the real balance entered by the user (base minor units)
 * @param adjust true: record the difference as an adjustment; false: only mark as checked
 *               (only meaningful when the difference is 0 — otherwise the user reviews transactions)
 */
export async function reconcile(walletId: ID, real: number, adjust: boolean, now = Date.now()): Promise<{ diff: number; undo?: Undo }> {
  const diff = real - (await recordedBalance(walletId));
  let undo: Undo | undefined;
  if (diff !== 0 && adjust) {
    const cats = await db.categories.toArray();
    const sysKey = diff < 0 ? 'adjustment_expense' : 'adjustment_income';
    const cat = cats.find((c) => c.sysKey === sysKey);
    if (!cat) throw new Error('missing category ' + sysKey);
    ({ undo } = await createTransaction({
      type: diff < 0 ? 'expense' : 'income', amount: Math.abs(diff), walletId, categoryId: cat.id, date: now, adjustment: true,
    }));
  }
  if (diff === 0 || adjust) await db.wallets.update(walletId, { lastReconciledAt: now });
  return { diff, undo };
}

/** Active wallets with money in them that haven't been checked for two weeks. */
export function walletsToReconcile(wallets: Wallet[], balances: Map<ID, number>, firstRunAt: number, now = Date.now()): Wallet[] {
  return wallets.filter((w) => {
    if (w.archived) return false;
    if (!(balances.get(w.id) ?? 0) && !w.openingBalance) return false;
    const since = w.lastReconciledAt ?? firstRunAt;
    return since > 0 && now - since > RECONCILE_EVERY_DAYS * DAY;
  });
}
