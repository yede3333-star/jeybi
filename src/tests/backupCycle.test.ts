import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../data/db';
import { initDatabase, wipeAll } from '../repo/init';
import { createTransaction, deleteTransaction } from '../repo/transactions';
import { addRepayment, createDebt } from '../repo/debts';
import { setBudget, monthKey } from '../repo/budgets';
import { saveRecurring } from '../repo/recurring';
import { moveGoalMoney, saveGoal } from '../repo/goals';
import { saveReceipt } from '../repo/receipts';
import { saveTemplate } from '../repo/templates';
import { updateZakatSettings } from '../repo/zakat';
import { getSettings, setSettings } from '../repo/settings';
import { getBalances } from '../repo/summary';
import { exportBackup, parseBackup, restoreBackup } from '../repo/backup';
import { parseRate, toBase } from '../services/currency';

const now = new Date(2026, 8, 24, 12).getTime();

/** Everything a user can own, sorted so the comparison ignores insertion order. */
async function snapshot() {
  const sort = <T extends { id?: string }>(a: T[]) => [...a].sort((x, y) => String(x.id).localeCompare(String(y.id)));
  const receipts = await Promise.all((await db.receipts.toArray()).map(async (r) => ({ id: r.id, mime: r.mime, bytes: Array.from(new Uint8Array(await r.blob.arrayBuffer())) })));
  const s = await getSettings();
  return {
    wallets: sort(await db.wallets.toArray()),
    categories: sort(await db.categories.toArray()),
    transactions: sort(await db.transactions.toArray()),
    templates: sort(await db.templates.toArray()),
    debts: sort(await db.debts.toArray()),
    budgets: sort(await db.budgets.toArray()),
    recurring: sort(await db.recurring.toArray()),
    pending: sort(await db.pending.toArray()),
    goals: sort(await db.goals.toArray()),
    goalMoves: sort(await db.goalMoves.toArray()),
    receipts: sort(receipts),
    audit: (await db.audit.count()),
    balances: await getBalances(),
    settings: { currencies: s.currencies, lastRates: s.lastRates, zakat: s.zakat, lang: s.lang, theme: s.theme, currency: s.currency, budgetAlerts: s.budgetAlerts },
  };
}

beforeEach(async () => {
  await wipeAll();
  await initDatabase();
});

describe('backup full cycle (export → wipe → import)', () => {
  it('brings back every phase-1 and phase-2 record, image and setting', async () => {
    const w = await db.wallets.toArray();
    const c = await db.categories.toArray();
    const cash = w.find((x) => x.sysKey === 'cash')!.id;
    const bankily = w.find((x) => x.sysKey === 'bankily')!.id;
    const food = c.find((x) => x.sysKey === 'food')!.id;
    const salary = c.find((x) => x.sysKey === 'salary')!.id;
    const rent = c.find((x) => x.sysKey === 'rent')!.id;

    // phase 1
    const png = new Blob([new Uint8Array([137, 80, 78, 71, 1, 2, 3, 250])], { type: 'image/png' });
    const receiptId = await saveReceipt(png);
    await createTransaction({ type: 'income', amount: 60_000_00, walletId: bankily, categoryId: salary, date: now - 5 * 86_400_000 });
    await createTransaction({ type: 'expense', amount: 1_250_50, walletId: cash, categoryId: food, date: now, note: 'بقالة', tags: ['سوق'], receiptId });
    await createTransaction({ type: 'transfer', amount: 5_000_00, walletId: bankily, toWalletId: cash, fee: 25_00, date: now });
    const { tx: gone } = await createTransaction({ type: 'expense', amount: 99_00, walletId: cash, categoryId: food, date: now });
    await deleteTransaction(gone.id);
    await saveTemplate({ name: 'رصيد هاتف', type: 'expense', amount: 200_00, categoryId: food, note: '', tags: [] });
    // phase 2: foreign currency, debts, budgets, recurring, goals (with image), zakat, currencies
    const rate = parseRate('43.25')!;
    await createTransaction({ type: 'expense', amount: toBase(20_00, rate), walletId: cash, categoryId: food, date: now, origCurrency: 'EUR', origAmount: 20_00, rateE4: rate });
    await setSettings({ currencies: [{ code: 'EUR', name: 'Euro' }, { code: 'SAR', name: 'ريال' }], lastRates: { EUR: rate, SAR: 105_000 } });
    const { debt } = await createDebt({ direction: 'owed_to_me', person: 'محمد', amount: 5_000_00, date: now, dueDate: now + 7 * 86_400_000, note: 'سلفة', walletId: cash });
    await addRepayment(debt.id, { amount: 2_000_00, walletId: bankily, date: now });
    await createDebt({ direction: 'i_owe', person: 'Fatima', amount: 1_500_00, date: now, dueDate: null, note: '', walletId: null });
    await setBudget(monthKey(now), food, 8_000_00);
    await saveRecurring({ name: 'إيجار', type: 'expense', amount: 9_000_00, walletId: cash, categoryId: rent, note: '', tags: [],
      frequency: 'monthly', startDate: now + 86_400_000, endDate: null, mode: 'confirm', active: true });
    const imageId = await saveReceipt(new Blob([new Uint8Array([255, 216, 255, 0, 42])], { type: 'image/jpeg' }));
    const g = await saveGoal({ name: 'هاتف', target: 15_000_00, targetDate: null, icon: 'smartphone', color: '#2563eb', imageId });
    await moveGoalMoney(g.id, bankily, 6_000_00);
    await updateZakatSettings({ basis: 'silver', gramPriceSilver: 45_00, hawlStart: now - 100 * 86_400_000 });

    const before = await snapshot();
    expect(before.debts.length).toBe(2);
    expect(before.goals[0].imageId).toBe(imageId);

    // the file travels as text (it is shared as .txt on Android)
    const text = JSON.stringify(await exportBackup());
    await wipeAll();
    await initDatabase();
    await setSettings({ pinHash: 'this-device', pinSalt: 'salt' });
    expect(await db.debts.count()).toBe(0);

    const { file, preview } = parseBackup(text);
    expect(preview).toMatchObject({ format: 2, debts: 2, goals: 1, receipts: 2 });
    await restoreBackup(file);

    const after = await snapshot();
    expect(after).toEqual(before);
    expect((await getSettings()).pinHash).toBe('this-device');
  });

  it('restores a backup twice in a row without duplicates', async () => {
    const text = JSON.stringify(await exportBackup());
    await restoreBackup(parseBackup(text).file);
    const once = await snapshot();
    await restoreBackup(parseBackup(text).file);
    expect(await snapshot()).toEqual(once);
  });
});
