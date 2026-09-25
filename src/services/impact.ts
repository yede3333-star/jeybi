// What an operation does to the wallets, before it is saved: which wallet would go below zero,
// and which savings goals would lose money set aside in that wallet. Pure (tested in
// src/tests/impact.test.ts); repo/impact.ts feeds it from the database.
import type { ID, Transaction, Wallet } from '../data/types';
import { walletDeltas } from './reports';

/** Change per wallet (minor units, + in / − out). */
export type Deltas = Map<ID, number>;

export interface NegativeHit { walletId: ID; before: number; after: number }
export interface SavingsHit { walletId: ID; goalId: ID; take: number }
export interface Impact { negative: NegativeHit[]; savings: SavingsHit[] }

export function addDeltas(into: Deltas, from: Iterable<[ID, number]>, sign = 1): Deltas {
  for (const [w, v] of from) into.set(w, (into.get(w) ?? 0) + sign * v);
  return into;
}

/** Deltas of transactions being added (sign 1) or removed (sign −1), deleted ones ignored. */
export function txDeltas(txs: Array<Transaction | undefined>, sign = 1, into: Deltas = new Map()): Deltas {
  for (const t of txs) if (t && t.deletedAt == null) addDeltas(into, walletDeltas(t), sign);
  return into;
}

/**
 * @param held money each goal holds in each wallet (from goal moves)
 * Savings: money set aside stays in the wallet, so an outflow first uses the free part
 * (balance − set aside) and only then the savings; `take` is how much more of the savings the
 * operation uses than before it.
 */
export function assessImpact(deltas: Deltas, wallets: Wallet[], balances: Map<ID, number>, held: Array<{ goalId: ID; walletId: ID; amount: number }>): Impact {
  const negative: NegativeHit[] = [];
  const savings: SavingsHit[] = [];
  for (const [walletId, delta] of deltas) {
    if (delta >= 0) continue;
    const w = wallets.find((x) => x.id === walletId);
    if (!w) continue;
    const before = balances.get(walletId) ?? 0;
    const after = before + delta;
    if (after < 0 && !w.allowNegative) negative.push({ walletId, before, after });
    const goals = held.filter((h) => h.walletId === walletId && h.amount > 0).sort((a, b) => b.amount - a.amount);
    const reserved = goals.reduce((a, g) => a + g.amount, 0);
    if (!reserved) continue;
    const shortfall = (x: number) => Math.min(reserved, Math.max(0, reserved - Math.max(x, 0)));
    let take = shortfall(after) - shortfall(before);
    for (const g of goals) {
      if (take <= 0) break;
      const t = Math.min(take, g.amount);
      savings.push({ walletId, goalId: g.goalId, take: t });
      take -= t;
    }
  }
  return { negative, savings };
}

export const hasImpact = (i: Impact) => i.negative.length > 0 || i.savings.length > 0;

/** Wallets below zero that should be flagged (red + reconcile). */
export function negativeWallets(wallets: Wallet[], balances: Map<ID, number>): Wallet[] {
  return wallets.filter((w) => !w.archived && (balances.get(w.id) ?? 0) < 0);
}
