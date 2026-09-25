import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../data/db';
import { initDatabase, wipeAll } from '../repo/init';
import { saveSmartEntries, learnRule, setRule, type SmartDraft } from '../repo/smart';
import { getBalances } from '../repo/summary';
import { getSettings } from '../repo/settings';
import { exportBackup, restoreBackup } from '../repo/backup';
import { MAX_AMOUNT } from '../repo/transactions';
import { matchQuery, parseQuery } from '../services/search';

beforeEach(async () => {
  await wipeAll();
  await initDatabase();
});

async function ids() {
  const w = await db.wallets.toArray();
  const c = await db.categories.toArray();
  return {
    cash: w.find((x) => x.sysKey === 'cash')!.id,
    bankily: w.find((x) => x.sysKey === 'bankily')!.id,
    groceries: c.find((x) => x.sysKey === 'groceries')!.id,
    commissions: c.find((x) => x.sysKey === 'commissions')!.id,
  };
}

describe('saving "اكتب يومك" entries', () => {
  it('saves every entry, keeps the sentence for search, and one undo removes them all', async () => {
    const i = await ids();
    const now = Date.now();
    const sentence = 'خبز 50، ودخلتني عمولة 2000، سلفت أحمد 500';
    const drafts: SmartDraft[] = [
      { kind: 'tx', input: { type: 'expense', amount: 5000, walletId: i.cash, categoryId: i.groceries, date: now, note: 'خبز 50' } },
      { kind: 'tx', input: { type: 'income', amount: 200000, walletId: i.bankily, categoryId: i.commissions, date: now, note: 'ودخلتني عمولة 2000' } },
      { kind: 'debt', input: { direction: 'owed_to_me', person: 'أحمد', amount: 50000, date: now, dueDate: null, note: 'سلفت أحمد 500', walletId: i.cash } },
    ];
    const before = await getBalances();
    const { count, undo } = await saveSmartEntries(drafts, sentence);
    expect(count).toBe(3);
    const txs = await db.transactions.toArray();
    expect(txs.filter((t) => t.type !== 'debt').every((t) => t.sourceText === sentence)).toBe(true);
    expect(await db.debts.count()).toBe(1);
    const after = await getBalances();
    expect(after.byWallet.get(i.cash)).toBe((before.byWallet.get(i.cash) ?? 0) - 5000 - 50000);
    expect(after.byWallet.get(i.bankily)).toBe((before.byWallet.get(i.bankily) ?? 0) + 200000);
    // search finds the income by a word that is only in the sentence
    const q = parseQuery('أحمد')!;
    expect(txs.filter((t) => t.type === 'income').some((t) => matchQuery(t, q) != null)).toBe(true);

    await undo();
    expect(await db.transactions.filter((t) => t.deletedAt == null).count()).toBe(0);
    expect(await db.debts.count()).toBe(0);
    expect(await getBalances()).toEqual(before);
  });

  it('all or nothing: one invalid entry saves none', async () => {
    const i = await ids();
    const drafts: SmartDraft[] = [
      { kind: 'tx', input: { type: 'expense', amount: 5000, walletId: i.cash, categoryId: i.groceries, date: Date.now() } },
      { kind: 'tx', input: { type: 'expense', amount: MAX_AMOUNT + 1, walletId: i.cash, categoryId: i.groceries, date: Date.now() } },
    ];
    await expect(saveSmartEntries(drafts, 'x')).rejects.toThrow();
    expect(await db.transactions.count()).toBe(0);
  });

  it('learned words are kept, editable, removable, and travel in backups', async () => {
    const i = await ids();
    await learnRule('شاي', { categoryId: i.groceries });
    await learnRule('شاي', { walletId: i.bankily });
    expect((await getSettings()).smartRules['شاي']).toMatchObject({ categoryId: i.groceries, walletId: i.bankily });
    const file = await exportBackup();
    expect(file.data.settings.smartRules).toHaveProperty('شاي');
    await setRule('شاي', null);
    expect((await getSettings()).smartRules).toEqual({});
    await restoreBackup(file);
    expect((await getSettings()).smartRules['شاي']).toMatchObject({ categoryId: i.groceries });
  });
});
