// Warn, don't block: negative balances and savings used by an operation (sections 2 and 3).
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../data/db';
import { initDatabase, wipeAll } from '../repo/init';
import { createTransaction } from '../repo/transactions';
import { heldInWallet, moveGoalMoney, saveGoal } from '../repo/goals';
import { deltasForDebt, deltasForDelete, deltasForRepayment, deltasForTx, impactOf, negativeNow, releaseSavings } from '../repo/impact';
import { updateWallet } from '../repo/wallets';
import { assessImpact, negativeWallets } from '../services/impact';
import type { Wallet } from '../data/types';

const W = (id: string, extra: Partial<Wallet> = {}): Wallet =>
  ({ id, name: id, color: '', icon: '', openingBalance: 0, archived: false, order: 0, createdAt: 0, updatedAt: 0, ...extra });

describe('assessImpact (pure)', () => {
  const wallets = [W('cash'), W('bank'), W('card', { allowNegative: true })];
  const balances = new Map([['cash', 500_00], ['bank', 12_000_00], ['card', 0]]);

  it('warns when an outflow takes a wallet below zero, with the balance before and after', () => {
    const i = assessImpact(new Map([['cash', -700_00]]), wallets, balances, []);
    expect(i.negative).toEqual([{ walletId: 'cash', before: 500_00, after: -200_00 }]);
  });

  it('no warning for inflows, for staying above zero, or for a wallet allowed below zero', () => {
    expect(assessImpact(new Map([['cash', 100_00]]), wallets, balances, []).negative).toEqual([]);
    expect(assessImpact(new Map([['cash', -500_00]]), wallets, balances, []).negative).toEqual([]);
    expect(assessImpact(new Map([['card', -900_00]]), wallets, balances, []).negative).toEqual([]);
  });

  it('savings: only what goes beyond the free money is taken, from the goal holding the most first', () => {
    // bank 12,000 of which 8,000 set aside (A 5,000 + B 3,000): 4,000 free
    const held = [{ goalId: 'A', walletId: 'bank', amount: 5_000_00 }, { goalId: 'B', walletId: 'bank', amount: 3_000_00 }];
    expect(assessImpact(new Map([['bank', -4_000_00]]), wallets, balances, held).savings).toEqual([]);
    expect(assessImpact(new Map([['bank', -6_000_00]]), wallets, balances, held).savings).toEqual([{ walletId: 'bank', goalId: 'A', take: 2_000_00 }]);
    const big = assessImpact(new Map([['bank', -10_000_00]]), wallets, balances, held);
    expect(big.savings).toEqual([{ walletId: 'bank', goalId: 'A', take: 5_000_00 }, { walletId: 'bank', goalId: 'B', take: 1_000_00 }]);
    expect(big.negative).toEqual([]); // still 2,000 in the wallet
  });

  it('savings already partly used (balance below what is set aside): only the new part is counted', () => {
    const b = new Map([['bank', 6_000_00]]);
    const held = [{ goalId: 'A', walletId: 'bank', amount: 8_000_00 }];
    expect(assessImpact(new Map([['bank', -1_000_00]]), wallets, b, held).savings).toEqual([{ walletId: 'bank', goalId: 'A', take: 1_000_00 }]);
  });

  it('lists wallets below zero (for the red cards)', () => {
    expect(negativeWallets(wallets, new Map([['cash', -1], ['bank', 5]])).map((w) => w.id)).toEqual(['cash']);
  });
});

describe('impact from the database', () => {
  let cash: string, bank: string, food: string, salary: string;
  beforeEach(async () => {
    await wipeAll();
    await initDatabase();
    const w = await db.wallets.toArray();
    const c = await db.categories.toArray();
    cash = w.find((x) => x.sysKey === 'cash')!.id;
    bank = w.find((x) => x.sysKey === 'bank')!.id;
    food = c.find((x) => x.sysKey === 'food')!.id;
    salary = c.find((x) => x.sysKey === 'salary')!.id;
    await createTransaction({ type: 'income', amount: 1_000_00, walletId: cash, categoryId: salary, date: Date.now() });
  });

  it('expense, transfer with fee, and editing an existing transaction', async () => {
    expect([...(await deltasForTx({ type: 'expense', amount: 1_500_00, walletId: cash, date: 0 }))]).toEqual([[cash, -1_500_00]]);
    const tr = await deltasForTx({ type: 'transfer', amount: 900_00, walletId: cash, toWalletId: bank, fee: 150_00, date: 0 });
    expect(tr.get(cash)).toBe(-1_050_00);
    expect((await impactOf(tr)).negative).toEqual([{ walletId: cash, before: 1_000_00, after: -50_00 }]);
    // editing an expense of 800 to 1,200 only costs 400 more
    const { tx } = await createTransaction({ type: 'expense', amount: 800_00, walletId: cash, categoryId: food, date: Date.now() });
    const edit = await deltasForTx({ type: 'expense', amount: 1_200_00, walletId: cash, categoryId: food, date: 0 }, tx.id);
    expect(edit.get(cash)).toBe(-400_00);
    expect((await impactOf(edit)).negative).toEqual([{ walletId: cash, before: 200_00, after: -200_00 }]);
  });

  it('deleting an income, lending and repaying', async () => {
    const inc = (await db.transactions.toArray())[0];
    // 1,000 in, 1,000 deleted: exactly zero is not negative
    expect((await impactOf(await deltasForDelete(inc.id))).negative).toEqual([]);
    await createTransaction({ type: 'expense', amount: 300_00, walletId: cash, categoryId: food, date: Date.now() });
    expect((await impactOf(await deltasForDelete(inc.id))).negative).toEqual([{ walletId: cash, before: 700_00, after: -300_00 }]);
    expect([...deltasForDebt({ direction: 'owed_to_me', amount: 50_00, walletId: cash })]).toEqual([[cash, -50_00]]);
    expect([...deltasForDebt({ direction: 'i_owe', amount: 50_00, walletId: cash })]).toEqual([[cash, 50_00]]);
    expect([...deltasForDebt({ direction: 'i_owe', amount: 50_00, walletId: null })]).toEqual([]);
    expect([...deltasForRepayment('i_owe', 70_00, bank)]).toEqual([[bank, -70_00]]);
    expect([...deltasForRepayment('owed_to_me', 70_00, bank)]).toEqual([[bank, 70_00]]);
  });

  it('a wallet allowed below zero is never warned about; negativeNow lists the others', async () => {
    await createTransaction({ type: 'expense', amount: 1_200_00, walletId: cash, categoryId: food, date: Date.now() });
    expect(await negativeNow()).toEqual([{ walletId: cash, balance: -200_00 }]);
    await updateWallet(cash, { allowNegative: true });
    expect(await negativeNow()).toEqual([]);
    expect((await impactOf(new Map([[cash, -1]]))).negative).toEqual([]);
  });

  it('continuing takes the used savings back from the goals', async () => {
    const trip = await saveGoal({ name: 'سفر', target: 5_000_00, targetDate: null, color: '#000', icon: 'plane' });
    await moveGoalMoney(trip.id, cash, 800_00); // 1,000 in cash, 800 set aside: 200 free
    const d = await deltasForTx({ type: 'expense', amount: 500_00, walletId: cash, date: 0 });
    const i = await impactOf(d);
    expect(i.savings).toEqual([{ walletId: cash, goalId: trip.id, take: 300_00 }]);
    expect(i.negative).toEqual([]);
    await createTransaction({ type: 'expense', amount: 500_00, walletId: cash, categoryId: food, date: Date.now() });
    await releaseSavings(i.savings);
    expect((await heldInWallet(cash)).get(trip.id)).toBe(500_00);
  });
});
