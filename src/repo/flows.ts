// Running per-wallet totals (income − expense ± transfers, excluding opening balances), kept in
// `meta` and updated inside the same Dexie transaction as every transaction write. This lets the
// home screen show balances without reading every transaction on each open.
//
// Every write to db.transactions in the repo layer must go through putTx / patchTx / deleteTxRow
// (or call rebuildFlows after bulk operations), inside a transaction that includes db.meta.
import { db } from '../data/db';
import type { ID, Transaction } from '../data/types';
import { walletDeltas } from '../services/reports';

export const FLOWS_KEY = 'walletFlows';
export type Flows = Record<ID, number>;

const contributions = (t?: Transaction): Array<[ID, number]> => (t && t.deletedAt == null ? walletDeltas(t) : []);

async function adjustFlows(before?: Transaction, after?: Transaction) {
  const delta = new Map<ID, number>();
  for (const [w, v] of contributions(before)) delta.set(w, (delta.get(w) ?? 0) - v);
  for (const [w, v] of contributions(after)) delta.set(w, (delta.get(w) ?? 0) + v);
  if (![...delta.values()].some((v) => v !== 0)) return;
  const row = await db.meta.get(FLOWS_KEY);
  if (!row) return; // not built yet — computed from scratch by ensureFlows()
  const flows = { ...(row.value as Flows) };
  for (const [w, v] of delta) flows[w] = (flows[w] ?? 0) + v;
  await db.meta.put({ key: FLOWS_KEY, value: flows });
}

export async function putTx(tx: Transaction) {
  const before = await db.transactions.get(tx.id);
  await db.transactions.put(tx);
  await adjustFlows(before, tx);
}

export async function patchTx(id: ID, patch: Partial<Transaction>) {
  const before = await db.transactions.get(id);
  if (!before) return;
  const after = { ...before, ...patch } as Transaction;
  for (const [k, v] of Object.entries(patch)) if (v === undefined) delete (after as unknown as Record<string, unknown>)[k];
  await db.transactions.put(after);
  await adjustFlows(before, after);
}

export async function deleteTxRow(id: ID) {
  const before = await db.transactions.get(id);
  await db.transactions.delete(id);
  await adjustFlows(before, undefined);
}

/** Full scan — used once to build the cache, after bulk operations, and by tests. */
export async function computeFlows(): Promise<Flows> {
  const flows: Flows = {};
  await db.transactions.each((t) => {
    for (const [w, v] of contributions(t)) flows[w] = (flows[w] ?? 0) + v;
  });
  return flows;
}

export async function rebuildFlows() {
  await db.meta.put({ key: FLOWS_KEY, value: await computeFlows() });
}

/** Builds the cache if missing (first open after upgrade, or after import). */
export async function ensureFlows() {
  if (!(await db.meta.get(FLOWS_KEY))) {
    await db.transaction('rw', db.transactions, db.meta, async () => {
      if (!(await db.meta.get(FLOWS_KEY))) await rebuildFlows();
    });
  }
}

/** Read-only (safe inside liveQuery): falls back to a full scan if the cache isn't built yet. */
export async function readFlows(): Promise<Flows> {
  const row = await db.meta.get(FLOWS_KEY);
  return row ? (row.value as Flows) : computeFlows();
}
