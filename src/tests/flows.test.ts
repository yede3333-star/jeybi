import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../data/db';
import { initDatabase, wipeAll } from '../repo/init';
import {
  createTransaction, deleteTransaction, emptyTrash, purgeTransaction, restoreTransaction, updateTransaction,
} from '../repo/transactions';
import { computeFlows, FLOWS_KEY, readFlows } from '../repo/flows';
import { getBalances, recentTransactions, totalsBetween } from '../repo/summary';
import { addDemoData, clearDemoData } from '../repo/demo';
import { exportBackup, restoreBackup } from '../repo/backup';
import { walletBalances, totalsFor } from '../services/reports';
import { periodFor } from '../lib/period';
import { calibrateIterations, createPinHash, PIN_ITERATIONS, verifyPin } from '../services/security';

let cash: string, bankily: string, food: string, salary: string;
const now = new Date(2026, 8, 20, 10).getTime();

beforeEach(async () => {
  await wipeAll();
  await initDatabase();
  const w = await db.wallets.toArray();
  const c = await db.categories.toArray();
  cash = w.find((x) => x.sysKey === 'cash')!.id;
  bankily = w.find((x) => x.sysKey === 'bankily')!.id;
  food = c.find((x) => x.sysKey === 'food')!.id;
  salary = c.find((x) => x.sysKey === 'salary')!.id;
});

/** The cached balances must always equal a full recomputation. */
async function expectConsistent() {
  const cached = (await db.meta.get(FLOWS_KEY))!.value as Record<string, number>;
  const full = await computeFlows();
  const nz = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== 0));
  expect(nz(cached)).toEqual(nz(full));
  const wallets = await db.wallets.toArray();
  const expected = walletBalances(wallets, await db.transactions.toArray());
  const { byWallet } = await getBalances();
  for (const w of wallets) expect(byWallet.get(w.id)).toBe(expected.get(w.id));
}

describe('cached wallet balances', () => {
  it('is built on first open', async () => {
    expect(await db.meta.get(FLOWS_KEY)).toBeDefined();
    await expectConsistent();
  });

  it('stays exact through create, edit, fee changes, delete, restore, undo and purge', async () => {
    const a = await createTransaction({ type: 'income', amount: 45_000_00, walletId: bankily, categoryId: salary, date: now });
    await expectConsistent();
    const tr = await createTransaction({ type: 'transfer', amount: 10_000_00, walletId: bankily, toWalletId: cash, fee: 50_00, date: now });
    await expectConsistent();
    const e = await createTransaction({ type: 'expense', amount: 300_00, walletId: cash, categoryId: food, date: now });
    const edit = await updateTransaction(e.tx.id, { type: 'expense', amount: 800_00, walletId: bankily, categoryId: food, date: now });
    await expectConsistent();
    await edit.undo();
    await expectConsistent();
    await updateTransaction(tr.tx.id, { type: 'transfer', amount: 9_000_00, walletId: cash, toWalletId: bankily, fee: 0, date: now });
    await expectConsistent();
    await updateTransaction(tr.tx.id, { type: 'transfer', amount: 9_000_00, walletId: cash, toWalletId: bankily, fee: 25_00, date: now });
    await expectConsistent();
    const del = await deleteTransaction(tr.tx.id);
    await expectConsistent();
    await del.undo();
    await expectConsistent();
    await deleteTransaction(a.tx.id);
    await restoreTransaction(a.tx.id);
    await expectConsistent();
    await e.undo(); // undo of a creation = purge
    await deleteTransaction(tr.tx.id);
    await emptyTrash();
    await expectConsistent();
    await purgeTransaction(a.tx.id);
    await expectConsistent();
  });

  it('stays exact through demo data, clearing it, and backup restore', async () => {
    await createTransaction({ type: 'expense', amount: 100_00, walletId: cash, categoryId: food, date: now });
    await addDemoData('ar', now);
    await expectConsistent();
    const backup = JSON.parse(JSON.stringify(await exportBackup()));
    await clearDemoData();
    await expectConsistent();
    await restoreBackup(backup);
    await expectConsistent();
  });

  it('readFlows falls back to a full scan if the cache is missing, and init rebuilds it', async () => {
    await createTransaction({ type: 'expense', amount: 100_00, walletId: cash, categoryId: food, date: now });
    await db.meta.delete(FLOWS_KEY);
    expect((await readFlows())[cash]).toBe(-100_00);
    await initDatabase();
    await expectConsistent();
  });
});

describe('home screen queries', () => {
  it('period totals and recent list match the full-scan computations', async () => {
    await addDemoData('ar', now);
    const all = await db.transactions.toArray();
    for (const kind of ['day', 'month'] as const) {
      const p = periodFor(kind, now);
      expect(await totalsBetween(p.start, p.end)).toEqual(totalsFor(all, p));
    }
    const recent = await recentTransactions(8);
    const expected = all.filter((t) => t.deletedAt == null).sort((a, b) => b.date - a.date).slice(0, 8);
    expect(recent.map((t) => t.date)).toEqual(expected.map((t) => t.date));
  });
});

describe('PIN hashing cost', () => {
  it('calibrates iterations within bounds and still verifies', async () => {
    const n = await calibrateIterations(30);
    expect(n).toBeGreaterThanOrEqual(PIN_ITERATIONS.min);
    expect(n).toBeLessThanOrEqual(PIN_ITERATIONS.max);
    const h = await createPinHash('2468');
    const stored = { pinHash: h.hash, pinSalt: h.salt, pinIterations: h.iterations };
    expect(await verifyPin('2468', stored)).toBe(true);
    expect(await verifyPin('2469', stored)).toBe(false);
  });
});
