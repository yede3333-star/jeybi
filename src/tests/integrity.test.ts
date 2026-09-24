// Balance integrity under random sequences of operations, checked against an independent model
// (a ledger kept by the test itself, not the app's formulas), plus edge cases found in review.
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../data/db';
import type { ID, Transaction } from '../data/types';
import { initDatabase, wipeAll } from '../repo/init';
import {
  createTransaction, deleteTransaction, MAX_AMOUNT, purgeTransaction, restoreTransaction, updateTransaction, type Undo,
} from '../repo/transactions';
import { computeFlows, FLOWS_KEY } from '../repo/flows';
import { getBalances } from '../repo/summary';
import { addRepayment, createDebt, debtStatus, updateDebt } from '../repo/debts';
import { reconcile } from '../repo/reconcile';
import { toBase } from '../services/currency';
import { removeWallet } from '../repo/wallets';
import { removeCategory } from '../repo/categories';
import { saveRecurring } from '../repo/recurring';
import { setBudget } from '../repo/budgets';
import { moveGoalMoney, saveGoal } from '../repo/goals';
import { createDebt as newDebt } from '../repo/debts';

function rng(seed: number) {
  return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
}

let wallets: ID[] = [];
let expenseCats: ID[] = [];
let incomeCats: ID[] = [];

beforeEach(async () => {
  await wipeAll();
  await initDatabase();
  wallets = (await db.wallets.toArray()).map((w) => w.id);
  const cats = await db.categories.toArray();
  expenseCats = cats.filter((c) => c.kind === 'expense' && c.sysKey !== 'fees').map((c) => c.id);
  incomeCats = cats.filter((c) => c.kind === 'income').map((c) => c.id);
});

describe('balance integrity under random operation sequences', () => {
  for (const seed of [1, 7, 42, 2026]) {
    it(`seed ${seed}: 250 random operations, balances always equal an independent ledger`, async () => {
      const r = rng(seed);
      const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
      const amt = () => (1 + Math.floor(r() * 5000)) * 100 + (r() < 0.2 ? Math.floor(r() * 100) : 0);
      /** Independent model: the wallet effect of every live row we created, by transaction id. */
      const effect = new Map<ID, Array<[ID, number]>>();
      const model = () => {
        const m: Record<ID, number> = Object.fromEntries(wallets.map((w) => [w, 0]));
        for (const eff of effect.values()) for (const [w, v] of eff) m[w] += v;
        return m;
      };
      const snapshot = async () => new Map((await db.transactions.toArray()).map((t) => [t.id, t]));
      /** Re-derive the model entries for rows whose deletion state or content changed. */
      const sync = async () => {
        effect.clear();
        for (const t of (await snapshot()).values()) {
          if (t.deletedAt != null) continue;
          // the test's own rules, written out independently from walletDeltas()
          if (t.type === 'income') effect.set(t.id, [[t.walletId, t.amount]]);
          else if (t.type === 'expense') effect.set(t.id, [[t.walletId, -t.amount]]);
          else if (t.type === 'transfer') effect.set(t.id, [[t.walletId, -t.amount], [t.toWalletId!, t.amount]]);
          else effect.set(t.id, [[t.walletId, t.flow === 'in' ? t.amount : -t.amount]]);
        }
      };
      const expected: Record<ID, number> = Object.fromEntries(wallets.map((w) => [w, 0]));
      const apply = (w: ID, v: number) => { expected[w] += v; };
      const undos: Array<{ undo: Undo; revert: () => void }> = [];
      const debts: ID[] = [];

      for (let step = 0; step < 250; step++) {
        const op = r();
        const live = [...(await snapshot()).values()].filter((t) => t.deletedAt == null && !t.transferId && t.type !== 'debt');
        if (op < 0.2) {
          const w = pick(wallets), a = amt();
          const inc = r() < 0.4;
          const { undo } = await createTransaction({ type: inc ? 'income' : 'expense', amount: a, walletId: w, categoryId: pick(inc ? incomeCats : expenseCats), date: Date.now() - Math.floor(r() * 400) * 864e5 });
          apply(w, inc ? a : -a);
          undos.push({ undo, revert: () => apply(w, inc ? -a : a) });
        } else if (op < 0.3) {
          const w = pick(wallets), a = amt(), part = Math.floor(a / 3);
          await createTransaction({ type: 'expense', amount: a, walletId: w, date: Date.now(), splits: [{ categoryId: expenseCats[0], amount: part }, { categoryId: expenseCats[1], amount: a - part }] });
          apply(w, -a);
        } else if (op < 0.42) {
          const from = pick(wallets); let to = pick(wallets); if (to === from) to = wallets[(wallets.indexOf(from) + 1) % wallets.length];
          const a = amt(), fee = r() < 0.5 ? Math.floor(r() * 100) * 100 : 0;
          await createTransaction({ type: 'transfer', amount: a, walletId: from, toWalletId: to, fee, date: Date.now() });
          apply(from, -a - fee); apply(to, a);
        } else if (op < 0.5) {
          const w = pick(wallets), orig = amt(), rate = 380_000 + Math.floor(r() * 100_000);
          const base = toBase(orig, rate);
          await createTransaction({ type: 'expense', amount: base, walletId: w, categoryId: pick(expenseCats), date: Date.now(), origCurrency: 'EUR', origAmount: orig, rateE4: rate });
          apply(w, -base);
        } else if (op < 0.58) {
          const w = r() < 0.2 ? null : pick(wallets), a = amt(), mine = r() < 0.5;
          const { debt } = await createDebt({ direction: mine ? 'owed_to_me' : 'i_owe', person: `P${step}`, amount: a, date: Date.now(), dueDate: null, note: '', walletId: w });
          if (w) apply(w, mine ? -a : a);
          debts.push(debt.id);
        } else if (op < 0.66 && debts.length) {
          const id = pick(debts);
          const d = (await db.debts.get(id))!;
          const st = debtStatus(d, await db.transactions.where('debtId').equals(id).toArray());
          if (st.remaining > 0) {
            const a = Math.max(1, Math.floor(st.remaining * r())), w = pick(wallets);
            await addRepayment(id, { amount: a, walletId: w, date: Date.now() });
            apply(w, d.direction === 'owed_to_me' ? a : -a);
          }
        } else if (op < 0.7 && debts.length) {
          // flip a debt's direction: principal and every repayment must flip with it
          const id = pick(debts);
          const d = (await db.debts.get(id))!;
          await updateDebt(id, { direction: d.direction === 'owed_to_me' ? 'i_owe' : 'owed_to_me', person: d.person, amount: d.amount, date: d.date, dueDate: null, note: '', walletId: d.walletId });
          // rows are read after the flip: change = new effect − old effect = 2 × new effect
          for (const t of await db.transactions.where('debtId').equals(id).toArray()) if (t.deletedAt == null) apply(t.walletId, 2 * (t.flow === 'in' ? t.amount : -t.amount));
        } else if (op < 0.76) {
          const w = pick(wallets), real = (expected[w] ?? 0) + (Math.floor(r() * 2000) - 1000) * 100;
          await reconcile(w, real, true);
          expected[w] = real;
        } else if (op < 0.84 && live.length) {
          const t = pick(live);
          const fee = t.feeTxId ? (await db.transactions.get(t.feeTxId)) : undefined;
          const { undo } = await deleteTransaction(t.id);
          const eff = (x: Transaction) => (x.type === 'income' ? [[x.walletId, x.amount]] : x.type === 'expense' ? [[x.walletId, -x.amount]] : [[x.walletId, -x.amount], [x.toWalletId!, x.amount]]) as Array<[ID, number]>;
          const all = [t, ...(fee && fee.deletedAt == null ? [fee] : [])];
          for (const x of all) for (const [w, v] of eff(x)) apply(w, -v);
          undos.push({ undo, revert: () => { for (const x of all) for (const [w, v] of eff(x)) apply(w, v); } });
        } else if (op < 0.9 && live.length) {
          const t = pick(live.filter((x) => x.type !== 'transfer' && !x.origCurrency && x.splits.length === 1));
          if (t) {
            const a = amt(), w = pick(wallets);
            const { undo } = await updateTransaction(t.id, { type: t.type, amount: a, walletId: w, categoryId: t.splits[0].categoryId, date: t.date });
            const sign = t.type === 'income' ? 1 : -1;
            apply(t.walletId, -sign * t.amount); apply(w, sign * a);
            undos.push({ undo, revert: () => { apply(w, -sign * a); apply(t.walletId, sign * t.amount); } });
          }
        } else if (op < 0.95 && undos.length) {
          const u = undos.pop()!;
          await u.undo();
          u.revert();
        } else {
          const trash = [...(await snapshot()).values()].filter((t) => t.deletedAt != null && !t.transferId && t.type !== 'debt');
          if (trash.length) {
            const t = pick(trash);
            if (r() < 0.5) {
              const before = model();
              await restoreTransaction(t.id);
              await sync();
              const after = model();
              for (const w of wallets) apply(w, after[w] - before[w]);
            } else {
              await purgeTransaction(t.id);
            }
            undos.length = 0; // older undos may refer to purged rows
          }
        }
        // ---- invariants after every step
        await sync();
        const got = Object.fromEntries((await getBalances()).byWallet);
        const opening = Object.fromEntries((await db.wallets.toArray()).map((w) => [w.id, w.openingBalance]));
        const byModel = model();
        for (const w of wallets) {
          expect(got[w], `step ${step} wallet balance vs expected ledger`).toBe(opening[w] + expected[w]);
          expect(got[w], `step ${step} wallet balance vs rows`).toBe(opening[w] + byModel[w]);
        }
        const nz = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== 0));
        expect(nz((await db.meta.get(FLOWS_KEY))!.value as Record<string, number>)).toEqual(nz(await computeFlows()));
      }
    }, 120_000);
  }
});

describe('edge cases found in review', () => {
  it('a wallet or category still referenced elsewhere is archived, never deleted', async () => {
    const [w1, w2, w3, w4] = wallets;
    await saveRecurring({ name: 'r', type: 'expense', amount: 100, walletId: w1, categoryId: expenseCats[0], note: '', tags: [], frequency: 'monthly', startDate: Date.now() + 864e5, endDate: null, mode: 'auto', active: true });
    await createTransaction({ type: 'income', amount: 10_000_00, walletId: w2, categoryId: incomeCats[0], date: Date.now() });
    const g = await saveGoal({ name: 'g', target: 100_00, targetDate: null, icon: 'target', color: '#000' });
    await moveGoalMoney(g.id, w2, 50_00);
    await newDebt({ direction: 'owed_to_me', person: 'x', amount: 100, date: Date.now(), dueDate: null, note: '', walletId: null });
    expect(await removeWallet(w1)).toBe('archived'); // recurring rule
    await db.transactions.clear(); await db.meta.delete(FLOWS_KEY);
    expect(await removeWallet(w2)).toBe('archived'); // goal money
    expect(await removeWallet(w4)).toBe('deleted'); // nothing points at it
    void w3;
    await setBudget('2026-09', expenseCats[1], 500_00);
    expect(await removeCategory(expenseCats[0])).toBe('archived'); // recurring
    expect(await removeCategory(expenseCats[1])).toBe('archived'); // budget
  });

  it('rejects absurd amounts instead of losing precision', async () => {
    await expect(createTransaction({ type: 'expense', amount: MAX_AMOUNT + 1, walletId: wallets[0], categoryId: expenseCats[0], date: Date.now() })).rejects.toMatchObject({ code: 'tooLarge' });
    const huge = toBase(MAX_AMOUNT, 9_999_999_999);
    await expect(createTransaction({ type: 'expense', amount: huge, walletId: wallets[0], categoryId: expenseCats[0], date: Date.now(), origCurrency: 'EUR', origAmount: MAX_AMOUNT, rateE4: 9_999_999_999 })).rejects.toMatchObject({ code: 'tooLarge' });
    await expect(createDebt({ direction: 'i_owe', person: 'x', amount: MAX_AMOUNT * 2, date: Date.now(), dueDate: null, note: '', walletId: null })).rejects.toMatchObject({ code: 'tooLarge' });
    // the largest allowed amount still sums exactly
    await createTransaction({ type: 'income', amount: MAX_AMOUNT, walletId: wallets[0], categoryId: incomeCats[0], date: Date.now() });
    await createTransaction({ type: 'income', amount: MAX_AMOUNT, walletId: wallets[0], categoryId: incomeCats[0], date: Date.now() });
    expect((await getBalances()).byWallet.get(wallets[0])).toBe(2 * MAX_AMOUNT);
  });

  it('zero or negative amounts are refused everywhere', async () => {
    await expect(createTransaction({ type: 'expense', amount: 0, walletId: wallets[0], categoryId: expenseCats[0], date: Date.now() })).rejects.toMatchObject({ code: 'amount' });
    await expect(createDebt({ direction: 'i_owe', person: 'x', amount: 0, date: Date.now(), dueDate: null, note: '', walletId: null })).rejects.toMatchObject({ code: 'amount' });
    await expect(saveGoal({ name: 'g', target: 0, targetDate: null, icon: 'target', color: '#000' })).rejects.toMatchObject({ code: 'amount' });
    await expect(saveRecurring({ name: 'r', type: 'expense', amount: 0, walletId: wallets[0], categoryId: expenseCats[0], note: '', tags: [], frequency: 'daily', startDate: Date.now(), endDate: null, mode: 'auto', active: true })).rejects.toMatchObject({ code: 'amount' });
  });
});
