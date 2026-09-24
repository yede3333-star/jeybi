// Cheap, indexed reads for the home screen (runs on every app open).
import { db } from '../data/db';
import type { ID, Transaction } from '../data/types';
import type { Totals } from '../services/reports';
import { readFlows } from './flows';

/** Wallet balances = opening balance + cached flows. No transaction scan. */
export async function getBalances(): Promise<{ byWallet: Map<ID, number>; total: number }> {
  const [wallets, flows] = await Promise.all([db.wallets.toArray(), readFlows()]);
  const byWallet = new Map<ID, number>();
  let total = 0;
  for (const w of wallets) {
    const v = w.openingBalance + (flows[w.id] ?? 0);
    byWallet.set(w.id, v);
    total += v;
  }
  return { byWallet, total };
}

/** Income/expense in [start, end) using the date index — reads only that range. */
export async function totalsBetween(start: number, end: number): Promise<Totals> {
  let income = 0, expense = 0;
  await db.transactions.where('date').between(start, end, true, false).each((t) => {
    if (t.deletedAt != null) return;
    if (t.type === 'income') income += t.amount;
    else if (t.type === 'expense') expense += t.amount;
  });
  return { income, expense, net: income - expense };
}

/** The n most recent live transactions, walking the date index backwards. */
export async function recentTransactions(n: number): Promise<Transaction[]> {
  return db.transactions.orderBy('date').reverse().filter((t) => t.deletedAt == null).limit(n).toArray();
}

export async function hasTransactions(): Promise<boolean> {
  return (await db.transactions.limit(1).count()) > 0;
}
