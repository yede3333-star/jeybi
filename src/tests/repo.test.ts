import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../data/db';
import { initDatabase, wipeAll } from '../repo/init';
import {
  createTransaction, deleteTransaction, feeOf, listActive, listDeleted, purgeTransaction, restoreTransaction,
  updateTransaction, ValidationError,
} from '../repo/transactions';
import { historyOf } from '../repo/audit';
import { removeCategory } from '../repo/categories';
import { exportBackup, parseBackup, restoreBackup } from '../repo/backup';
import { applyTemplate, saveTemplate } from '../repo/templates';
import { addDemoData, clearDemoData } from '../repo/demo';
import { getSettings, setSettings } from '../repo/settings';
import { totalBalance, totalsFor } from '../services/reports';
import { periodFor } from '../lib/period';

let cash: string, bankily: string, food: string, transport: string, fees: string, salary: string;

beforeEach(async () => {
  await wipeAll();
  await initDatabase();
  const w = await db.wallets.toArray();
  const c = await db.categories.toArray();
  cash = w.find((x) => x.sysKey === 'cash')!.id;
  bankily = w.find((x) => x.sysKey === 'bankily')!.id;
  food = c.find((x) => x.sysKey === 'food')!.id;
  transport = c.find((x) => x.sysKey === 'transport')!.id;
  fees = c.find((x) => x.sysKey === 'fees')!.id;
  salary = c.find((x) => x.sysKey === 'salary')!.id;
});

const now = new Date(2026, 8, 20, 10).getTime();

describe('seeding', () => {
  it('creates the 5 default wallets and categories once', async () => {
    expect(await db.wallets.count()).toBe(5);
    const before = await db.categories.count();
    await initDatabase();
    expect(await db.categories.count()).toBe(before);
  });
});

describe('create / validation', () => {
  it('stores a single-category expense as one split and remembers the wallet', async () => {
    const { tx } = await createTransaction({ type: 'expense', amount: 200_00, walletId: cash, categoryId: food, date: now, tags: ['#عرس', ' سفر روصو '] });
    expect(tx.splits).toEqual([{ categoryId: food, amount: 200_00 }]);
    expect(tx.tags).toEqual(['عرس', 'سفر_روصو']);
    expect((await getSettings()).lastWalletId).toBe(cash);
  });
  it('rejects a split whose parts do not add up', async () => {
    await expect(createTransaction({ type: 'expense', amount: 5_000_00, walletId: cash, date: now,
      splits: [{ categoryId: food, amount: 3_000_00 }, { categoryId: transport, amount: 1_000_00 }] }))
      .rejects.toMatchObject({ code: 'splitSum' });
  });
  it('rejects bad amounts and same-wallet transfers', async () => {
    await expect(createTransaction({ type: 'expense', amount: 0, walletId: cash, categoryId: food, date: now })).rejects.toBeInstanceOf(ValidationError);
    await expect(createTransaction({ type: 'transfer', amount: 100, walletId: cash, toWalletId: cash, date: now })).rejects.toMatchObject({ code: 'transferWallets' });
  });
});

describe('transfers and fees', () => {
  it('records the fee as a separate linked expense in "fees"', async () => {
    const { tx } = await createTransaction({ type: 'transfer', amount: 10_000_00, walletId: bankily, toWalletId: cash, fee: 50_00, date: now });
    const all = await listActive();
    expect(all).toHaveLength(2);
    const fee = all.find((t) => t.type === 'expense')!;
    expect(fee).toMatchObject({ amount: 50_00, walletId: bankily, transferId: tx.id, categoryIds: [fees] });
    const month = periodFor('month', now);
    expect(totalsFor(all, month)).toEqual({ income: 0, expense: 50_00, net: -50_00 });
  });
  it('editing the fee updates, and removing it deletes, the linked expense', async () => {
    const { tx } = await createTransaction({ type: 'transfer', amount: 10_000_00, walletId: bankily, toWalletId: cash, fee: 50_00, date: now });
    await updateTransaction(tx.id, { type: 'transfer', amount: 10_000_00, walletId: bankily, toWalletId: cash, fee: 80_00, date: now });
    expect(await feeOf((await db.transactions.get(tx.id))!)).toBe(80_00);
    await updateTransaction(tx.id, { type: 'transfer', amount: 10_000_00, walletId: bankily, toWalletId: cash, fee: 0, date: now });
    expect((await listActive()).filter((t) => t.type === 'expense')).toHaveLength(0);
  });
  it('deleting a transfer takes its fee to the trash, and undo brings both back', async () => {
    const { tx } = await createTransaction({ type: 'transfer', amount: 1_000_00, walletId: bankily, toWalletId: cash, fee: 10_00, date: now });
    const { undo } = await deleteTransaction(tx.id);
    expect(await listActive()).toHaveLength(0);
    expect(await listDeleted()).toHaveLength(2);
    await undo();
    expect(await listActive()).toHaveLength(2);
  });
});

describe('undo and history', () => {
  it('undo of an edit restores the previous values and logs both changes', async () => {
    const { tx } = await createTransaction({ type: 'expense', amount: 300_00, walletId: cash, categoryId: food, date: now, note: 'غداء' });
    const { undo } = await updateTransaction(tx.id, { type: 'expense', amount: 450_00, walletId: bankily, categoryId: transport, date: now, note: 'تاكسي' });
    let cur = (await db.transactions.get(tx.id))!;
    expect(cur).toMatchObject({ amount: 450_00, walletId: bankily, note: 'تاكسي' });
    await undo();
    cur = (await db.transactions.get(tx.id))!;
    expect(cur).toMatchObject({ amount: 300_00, walletId: cash, note: 'غداء', categoryIds: [food] });
    const h = await historyOf(tx.id);
    expect(h.map((x) => x.action)).toEqual(['create', 'update', 'update']);
    const amountChange = h[1].changes!.find((c) => c.field === 'amount')!;
    expect(amountChange).toEqual({ field: 'amount', old: 300_00, new: 450_00 });
  });
  it('undo of a creation removes the transaction completely', async () => {
    const { tx, undo } = await createTransaction({ type: 'expense', amount: 100_00, walletId: cash, categoryId: food, date: now });
    await undo();
    expect(await db.transactions.get(tx.id)).toBeUndefined();
    expect(await historyOf(tx.id)).toHaveLength(0);
  });
  it('soft delete, restore from trash, then purge', async () => {
    const { tx } = await createTransaction({ type: 'expense', amount: 100_00, walletId: cash, categoryId: food, date: now });
    await deleteTransaction(tx.id);
    const w = await db.wallets.toArray();
    expect(totalBalance(w, await db.transactions.toArray())).toBe(0); // deleted → not counted
    await restoreTransaction(tx.id);
    expect(await listActive()).toHaveLength(1);
    expect((await historyOf(tx.id)).map((x) => x.action)).toEqual(['create', 'delete', 'restore']);
    await purgeTransaction(tx.id);
    expect(await db.transactions.count()).toBe(0);
  });
});

describe('categories', () => {
  it('a used category is archived instead of deleted', async () => {
    await createTransaction({ type: 'expense', amount: 100_00, walletId: cash, categoryId: transport, date: now });
    expect(await removeCategory(transport)).toBe('archived');
    expect((await db.categories.get(transport))!.archived).toBe(true);
  });
});

describe('templates', () => {
  it("records into the template's own wallet", async () => {
    const tpl = await saveTemplate({ name: 'رصيد هاتف', type: 'expense', amount: 200_00, categoryId: food, walletId: bankily, note: '', tags: [] });
    const { tx } = await applyTemplate(tpl);
    expect(tx).toMatchObject({ amount: 200_00, walletId: bankily });
  });
  it('never guesses a wallet: an old template without one (or with an archived one) asks for it', async () => {
    await createTransaction({ type: 'expense', amount: 100_00, walletId: bankily, categoryId: food, date: now });
    const old = await saveTemplate({ name: 'قديم', type: 'expense', amount: 200_00, categoryId: food, note: '', tags: [] });
    await expect(applyTemplate(old)).rejects.toMatchObject({ code: 'templateWallet' });
    await db.wallets.update(bankily, { archived: true });
    const archived = await saveTemplate({ name: 'مؤرشف', type: 'expense', amount: 200_00, categoryId: food, walletId: bankily, note: '', tags: [] });
    await expect(applyTemplate(archived)).rejects.toMatchObject({ code: 'templateWallet' });
  });
});

describe('backup', () => {
  it('round-trips all data and keeps the device PIN', async () => {
    await createTransaction({ type: 'income', amount: 45_000_00, walletId: bankily, categoryId: salary, date: now });
    await createTransaction({ type: 'transfer', amount: 1_000_00, walletId: bankily, toWalletId: cash, fee: 10_00, date: now });
    const file = JSON.parse(JSON.stringify(await exportBackup()));
    expect(file.data.settings.pinHash).toBeUndefined();
    const { preview } = parseBackup(JSON.stringify(file));
    expect(preview.transactions).toBe(3);

    await wipeAll();
    await setSettings({ pinHash: 'device-pin', pinSalt: 's' });
    await restoreBackup(file);
    expect(await db.transactions.count()).toBe(3);
    const s = await getSettings();
    expect(s.pinHash).toBe('device-pin');
    expect(s.onboarded).toBe(true);
  });
  it('refuses files that are not Jeybi backups', () => {
    expect(() => parseBackup('{"hello":1}')).toThrow();
    expect(() => parseBackup('not json')).toThrow();
  });
});

describe('demo data', () => {
  it('adds removable demo transactions without touching real ones', async () => {
    await createTransaction({ type: 'expense', amount: 100_00, walletId: cash, categoryId: food, date: now });
    const added = await addDemoData('ar', now);
    expect(added).toBeGreaterThan(300);
    const removed = await clearDemoData();
    expect(removed).toBe(added);
    expect(await db.transactions.count()).toBe(1);
  });
});
