// Feeds services/impact.ts from the database: the effect of an operation on the wallets before it
// is saved (negative balance, savings used), and releasing the savings once the user goes ahead.
import { db } from '../data/db';
import type { DebtDirection, ID, Transaction } from '../data/types';
import { addDeltas, assessImpact, txDeltas, type Deltas, type Impact, type SavingsHit } from '../services/impact';
import { getBalances } from './summary';
import { moveGoalMoney } from './goals';
import { principalFlow, repaymentFlow, type DebtInput } from './debts';
import type { TxInput } from './transactions';

export async function impactOf(deltas: Deltas): Promise<Impact> {
  const [wallets, balances, moves] = await Promise.all([db.wallets.toArray(), getBalances(), db.goalMoves.toArray()]);
  const held = new Map<string, { goalId: ID; walletId: ID; amount: number }>();
  for (const m of moves) {
    const k = `${m.goalId}:${m.walletId}`;
    const h = held.get(k) ?? { goalId: m.goalId, walletId: m.walletId, amount: 0 };
    h.amount += m.amount;
    held.set(k, h);
  }
  return assessImpact(deltas, wallets, balances.byWallet, [...held.values()]);
}

/** A transaction as the editor would save it (plus its transfer fee), minus the version it replaces. */
export async function deltasForTx(input: TxInput, replaceId?: ID): Promise<Deltas> {
  const d: Deltas = new Map();
  const pseudo = { type: input.type, amount: input.amount, walletId: input.walletId, toWalletId: input.toWalletId, deletedAt: null } as Transaction;
  txDeltas([pseudo], 1, d);
  if (input.type === 'transfer' && input.fee && input.fee > 0) addDeltas(d, [[input.walletId, -input.fee]]);
  if (replaceId) {
    const old = await db.transactions.get(replaceId);
    const oldFee = old?.feeTxId ? await db.transactions.get(old.feeTxId) : undefined;
    txDeltas([old, oldFee], -1, d);
  }
  return d;
}

/** Deleting a transaction (and its transfer fee): an income deleted takes money out. */
export async function deltasForDelete(id: ID): Promise<Deltas> {
  const tx = await db.transactions.get(id);
  const fee = tx?.feeTxId ? await db.transactions.get(tx.feeTxId) : undefined;
  return txDeltas([tx, fee], -1);
}

export function deltasForDebt(input: Pick<DebtInput, 'direction' | 'amount' | 'walletId'>): Deltas {
  if (!input.walletId) return new Map();
  return new Map([[input.walletId, principalFlow(input.direction) === 'in' ? input.amount : -input.amount]]);
}

export function deltasForRepayment(direction: DebtDirection, amount: number, walletId: ID): Deltas {
  return new Map([[walletId, repaymentFlow(direction) === 'in' ? amount : -amount]]);
}

/** After the user went ahead: the savings the operation used are taken back from those goals. */
export async function releaseSavings(hits: SavingsHit[], note = ''): Promise<void> {
  for (const h of hits) await moveGoalMoney(h.goalId, h.walletId, -h.take, Date.now(), note);
}

/** Wallets below zero after automatic operations (recurring), for a notice. */
export async function negativeNow(walletIds?: Iterable<ID>): Promise<Array<{ walletId: ID; balance: number }>> {
  const [wallets, balances] = await Promise.all([db.wallets.toArray(), getBalances()]);
  const only = walletIds ? new Set(walletIds) : null;
  return wallets
    .filter((w) => !w.archived && !w.allowNegative && (!only || only.has(w.id)))
    .map((w) => ({ walletId: w.id, balance: balances.byWallet.get(w.id) ?? 0 }))
    .filter((x) => x.balance < 0);
}
