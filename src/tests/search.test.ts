import { beforeEach, describe, expect, it } from 'vitest';
import type { Category, Template, Transaction, Wallet } from '../data/types';
import { buildSearchNames, matchQuery, matchText, normalize, parseQuery } from '../services/search';
import { createDebt, addRepayment } from '../repo/debts';
import { saveGoal, listGoals } from '../repo/goals';
import { filterTransactions, sumFiltered } from '../services/reports';
import ar from '../i18n/ar';
import fr from '../i18n/fr';
import { db } from '../data/db';
import { initDatabase, wipeAll } from '../repo/init';
import { createTransaction, listActive } from '../repo/transactions';
import { applyTemplate, listTemplates, saveTemplate } from '../repo/templates';

// Same label lookup as the Transactions page: built-in names in both languages.
const labels = (k: string) => [(ar.sys as Record<string, string>)[k], (fr.sys as Record<string, string>)[k]].filter(Boolean);

const cat = (id: string, sysKey: string | undefined, name = '', parentId: string | null = null): Category => ({
  id, kind: 'expense', parentId, name, sysKey, color: '#000', icon: 'tag', archived: false, order: 0, createdAt: 0, updatedAt: 0,
});
const wal = (id: string, sysKey?: string, name = ''): Wallet => ({
  id, name, sysKey, color: '#000', icon: 'wallet', openingBalance: 0, archived: false, order: 0, createdAt: 0, updatedAt: 0,
});
const tx = (p: Partial<Transaction> & Pick<Transaction, 'id' | 'amount'>): Transaction => {
  const splits = p.splits ?? [{ categoryId: 'groceries', amount: p.amount }];
  return {
    type: 'expense', walletId: 'cash', date: 1, note: '', tags: [], currency: 'MRU', createdAt: 0, updatedAt: 0, deletedAt: null,
    ...p, splits, categoryIds: splits.map((s) => s.categoryId),
  };
};

const categories = [
  cat('food', 'food'), cat('groceries', 'groceries', '', 'food'), cat('transport', 'transport'),
  cat('custom', undefined, 'مصاريف الإستراحة'),
];
const wallets = [wal('cash', 'cash'), wal('bankily', 'bankily'), wal('mine', undefined, 'Épargne Été')];
const templates: Template[] = [{ id: 'tpl1', name: 'رصيد هاتف', type: 'expense', amount: 200_00, categoryId: 'food', note: '', tags: [], order: 0, createdAt: 0 }];
const names = buildSearchNames(categories, wallets, templates, labels);

// A quick entry: no note, no tags — "بقالة" exists only as the translated category name.
const quick = tx({ id: 'quick', amount: 250_00 });
const txs: Transaction[] = [
  quick,
  tx({ id: 'noted', amount: 1_500_00, note: 'غَداءٌ في المطعم', splits: [{ categoryId: 'food', amount: 1_500_00 }] }),
  tx({ id: 'tagged', amount: 3_000_00, tags: ['سفر_روصو'], splits: [{ categoryId: 'transport', amount: 3_000_00 }] }),
  tx({ id: 'split', amount: 5_000_00, splits: [{ categoryId: 'groceries', amount: 3_000_00 }, { categoryId: 'custom', amount: 2_000_00 }] }),
  tx({ id: 'fr', amount: 700_00, note: 'Café crème', walletId: 'mine', splits: [{ categoryId: 'food', amount: 700_00 }] }),
  tx({ id: 'tpl', amount: 200_00, templateId: 'tpl1', splits: [{ categoryId: 'food', amount: 200_00 }] }),
  tx({ id: 'deleted', amount: 250_00, deletedAt: 5 }),
];
const find = (q: string) => filterTransactions(txs, { text: q, names }).map((r) => r.tx.id).sort();

describe('normalize', () => {
  it('removes Arabic diacritics and tatweel', () => {
    expect(normalize('غَداءٌ')).toBe('غداء');
    expect(normalize('بقـــالة')).toBe(normalize('بقالة'));
  });
  it('unifies alef, teh marbuta, alef maksura, hamza carriers', () => {
    expect(normalize('أإآٱ')).toBe('اااا');
    expect(normalize('بقالة')).toBe('بقاله');
    expect(normalize('مستشفى')).toBe('مستشفي');
    expect(normalize('مؤسسة')).toBe('موسسه');
    expect(normalize('بئر')).toBe('بير');
  });
  it('lowercases and strips French accents', () => {
    expect(normalize('Épicerie ÉTÉ')).toBe('epicerie ete');
    expect(normalize('Crème')).toBe('creme');
  });
  it('converts Eastern Arabic digits', () => {
    expect(normalize('٥٠٠٠')).toBe('5000');
    expect(normalize('۱۲')).toBe('12');
  });
});

describe('the "بقالة" case', () => {
  it('finds a quick entry whose only link to the word is its (translated) category name', () => {
    expect(quick.note).toBe('');
    expect(categories.find((c) => c.id === 'groceries')!.name).toBe(''); // stored name is empty: display comes from sysKey
    expect(find('بقالة')).toEqual(['quick', 'split']);
  });
  it('does NOT find it with the old behaviour (notes and tags only, no names)', () => {
    expect(filterTransactions(txs, { text: 'بقالة' }).map((r) => r.tx.id)).toEqual([]);
  });
  it('matches partially and ignores spelling variants', () => {
    expect(find('بقا')).toEqual(['quick', 'split']);
    expect(find('بقاله')).toEqual(['quick', 'split']);
  });
  it('matches the parent category and the other language', () => {
    expect(find('طعام')).toEqual(['fr', 'noted', 'quick', 'split', 'tpl']);
    expect(find('épicerie')).toEqual(['quick', 'split']);
    expect(find('EPICERIE')).toEqual(['quick', 'split']);
  });
});

describe('search fields', () => {
  it('notes, ignoring diacritics in the stored text', () => expect(find('غداء')).toEqual(['noted']));
  it('tags, with or without # and underscore', () => {
    expect(find('#سفر_روصو')).toEqual(['tagged']);
    expect(find('سفر روصو')).toEqual(['tagged']);
  });
  it('custom category names, with hamza variants', () => expect(find('الاستراحة')).toEqual(['split']));
  it('wallet names (built-in in both languages, and custom)', () => {
    expect(find('نقد')).toEqual(['noted', 'quick', 'split', 'tagged', 'tpl']);
    expect(find('especes')).toEqual(['noted', 'quick', 'split', 'tagged', 'tpl']);
    expect(find('epargne ete')).toEqual(['fr']);
  });
  it('template names', () => expect(find('رصيد هاتف')).toEqual(['tpl']));
  it('French text is case and accent insensitive', () => expect(find('CAFE CREME')).toEqual(['fr']));
  it('all words must match', () => {
    expect(find('بقالة نقد')).toEqual(['quick', 'split']);
    expect(find('بقالة بنكيلي')).toEqual([]);
  });
  it('never returns deleted transactions', () => expect(find('بقالة')).not.toContain('deleted'));
});

describe('amount search', () => {
  it.each(['5000', '5 000', '5,000', '5.000', '٥٠٠٠', '٥٬٠٠٠'.replace('٬', ',')])('"%s" finds the 5000 transaction', (q) => {
    expect(find(q)).toEqual(['split']);
  });
  it('compares with the ×100 stored amount', () => {
    expect(parseQuery('250')!.amount).toBe(250_00);
    expect(find('250')).toEqual(['quick']);
    expect(find('250.00')).toEqual(['quick']);
  });
  it('finds split parts and counts only the matching part', () => {
    const rows = filterTransactions(txs, { text: '3000', names });
    expect(rows.map((r) => r.tx.id).sort()).toEqual(['split', 'tagged']);
    expect(rows.find((r) => r.tx.id === 'split')!.counted).toBe(3_000_00);
    expect(sumFiltered(rows).expense).toBe(6_000_00);
  });
  it('range filter also looks at split parts', () => {
    const rows = filterTransactions(txs, { amountMin: 2_000_00, amountMax: 2_000_00, names });
    expect(rows.map((r) => [r.tx.id, r.counted])).toEqual([['split', 2_000_00]]);
  });
  it('a number that is not an amount of any transaction can still match text', () => {
    expect(matchQuery(tx({ id: 'x', amount: 1, note: 'غرفة 12' }), parseQuery('12')!, names)).toBe(1);
  });
});

describe('search against the real database (built-in categories)', () => {
  beforeEach(async () => {
    await wipeAll();
    await initDatabase();
  });
  it('finds "بقالة" for a quick entry stored with an empty note', async () => {
    const all = await db.categories.toArray();
    const groceries = all.find((c) => c.sysKey === 'groceries')!;
    const cash = (await db.wallets.toArray()).find((w) => w.sysKey === 'cash')!;
    await createTransaction({ type: 'expense', amount: 250_00, walletId: cash.id, categoryId: groceries.id, date: Date.now() });
    const n = buildSearchNames(all, await db.wallets.toArray(), [], labels);
    const rows = filterTransactions(await listActive(), { text: 'بقالة', names: n });
    expect(rows).toHaveLength(1);
    expect(rows[0].tx.note).toBe('');
  });
  it('transactions created from a template are found by the template name', async () => {
    const food = (await db.categories.toArray()).find((c) => c.sysKey === 'food')!;
    const wallet = (await db.wallets.toArray())[0];
    const tpl = await saveTemplate({ name: 'تاكسي المطار', type: 'expense', amount: 100_00, categoryId: food.id, walletId: wallet.id, note: '', tags: [] });
    await applyTemplate(tpl);
    const n = buildSearchNames(await db.categories.toArray(), await db.wallets.toArray(), await listTemplates(), labels);
    expect(filterTransactions(await listActive(), { text: 'المطار', names: n })).toHaveLength(1);
  });
});

describe("phase 2: people in debts, savings goals, foreign amounts", () => {
  beforeEach(async () => {
    await wipeAll();
    await initDatabase();
  });
  it("finds debt movements by the person's name, with Arabic normalisation", async () => {
    const cash = (await db.wallets.toArray()).find((w) => w.sysKey === "cash")!;
    const { debt } = await createDebt({ direction: "owed_to_me", person: "محمد الأمين", amount: 5_000_00, date: Date.now(), dueDate: null, note: "", walletId: cash.id });
    await addRepayment(debt.id, { amount: 2_000_00, walletId: cash.id, date: Date.now() });
    const n = buildSearchNames(await db.categories.toArray(), await db.wallets.toArray(), [], labels, await db.debts.toArray());
    const all = await listActive();
    expect(filterTransactions(all, { text: "الامين", names: n })).toHaveLength(2);
    expect(filterTransactions(all, { text: "محمد", names: n })).toHaveLength(2);
    expect(filterTransactions(all, { text: "2000", names: n })).toHaveLength(1);
    expect(matchText(parseQuery("امين")!, debt.person)).toBe(true);
  });
  it("finds savings goals by name (accent/hamza insensitive) and by target amount", async () => {
    await saveGoal({ name: "Voyage à Atâr", target: 80_000_00, targetDate: null, icon: "plane", color: "#000" });
    await saveGoal({ name: "خروف الأضحى", target: 60_000_00, targetDate: null, icon: "target", color: "#000" });
    const goals = (await listGoals()).map((g) => g.goal);
    const hit = (q: string) => goals.filter((g) => matchText(parseQuery(q)!, g.name, [g.target])).map((g) => g.name);
    expect(hit("atar")).toEqual(["Voyage à Atâr"]);
    expect(hit("الاضحي")).toEqual(["خروف الأضحى"]);
    expect(hit("60 000")).toEqual(["خروف الأضحى"]);
  });
  it("matches the original foreign-currency amount", () => {
    const t = tx({ id: "eur", amount: 865_00, origCurrency: "EUR", origAmount: 20_00, rateE4: 432_500 });
    expect(matchQuery(t, parseQuery("20")!, names)).toBe(865_00);
    expect(matchQuery(t, parseQuery("865")!, names)).toBe(865_00);
  });
});
