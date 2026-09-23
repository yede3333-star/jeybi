import { describe, expect, it } from 'vitest';
import type { Category, Transaction, Wallet } from '../data/types';
import {
  buildReport, byCategory, expandCategoryIds, filterTransactions, pctChange, sumFiltered, timeline, totalBalance,
  totalsFor, walletBalances,
} from '../services/reports';
import { periodFor, previousPeriod } from '../lib/period';

const d = (y: number, m: number, day: number, h = 12) => new Date(y, m - 1, day, h).getTime();

const wallet = (id: string, opening = 0): Wallet => ({
  id, name: id, color: '#000', icon: 'wallet', openingBalance: opening, archived: false, order: 0, createdAt: 0, updatedAt: 0,
});
const cat = (id: string, kind: 'income' | 'expense', parentId: string | null = null): Category => ({
  id, kind, parentId, name: id, color: '#000', icon: 'tag', archived: false, order: 0, createdAt: 0, updatedAt: 0,
});
let n = 0;
function tx(p: Partial<Transaction> & Pick<Transaction, 'type' | 'amount' | 'walletId' | 'date'>): Transaction {
  const splits = p.splits ?? (p.type === 'transfer' ? [] : [{ categoryId: p.categoryIds?.[0] ?? 'food', amount: p.amount }]);
  return {
    id: `t${++n}`, note: '', tags: [], currency: 'MRU', createdAt: 0, updatedAt: 0, deletedAt: null,
    ...p, splits, categoryIds: splits.map((s) => s.categoryId),
  };
}

const wallets = [wallet('cash', 10_000_00), wallet('bankily', 5_000_00)];
const categories = [
  cat('food', 'expense'), cat('groceries', 'expense', 'food'), cat('restaurants', 'expense', 'food'),
  cat('transport', 'expense'), cat('household', 'expense'), cat('fees', 'expense'),
  cat('salary', 'income'), cat('gifts', 'income'),
];

// September 2026
const txs: Transaction[] = [
  tx({ type: 'income', amount: 45_000_00, walletId: 'bankily', date: d(2026, 9, 1), categoryIds: ['salary'] }),
  tx({ type: 'expense', amount: 3_000_00, walletId: 'cash', date: d(2026, 9, 2), categoryIds: ['groceries'] }),
  tx({ type: 'expense', amount: 1_000_00, walletId: 'cash', date: d(2026, 9, 3), categoryIds: ['restaurants'] }),
  tx({ type: 'expense', amount: 500_00, walletId: 'cash', date: d(2026, 9, 3), categoryIds: ['transport'], tags: ['سفر_روصو'], note: 'تاكسي روصو' }),
  // split: 5000 = 3000 food + 2000 household
  tx({ type: 'expense', amount: 5_000_00, walletId: 'bankily', date: d(2026, 9, 12),
    splits: [{ categoryId: 'food', amount: 3_000_00 }, { categoryId: 'household', amount: 2_000_00 }] }),
  // transfer bankily → cash 10,000 with a separate 50 fee expense
  tx({ type: 'transfer', amount: 10_000_00, walletId: 'bankily', toWalletId: 'cash', date: d(2026, 9, 14) }),
  tx({ type: 'expense', amount: 50_00, walletId: 'bankily', date: d(2026, 9, 14), categoryIds: ['fees'], transferId: 'x' }),
  // deleted — must be ignored everywhere
  tx({ type: 'expense', amount: 99_999_00, walletId: 'cash', date: d(2026, 9, 15), categoryIds: ['food'], deletedAt: 1 }),
  // August
  tx({ type: 'income', amount: 40_000_00, walletId: 'bankily', date: d(2026, 8, 1), categoryIds: ['salary'] }),
  tx({ type: 'expense', amount: 8_000_00, walletId: 'cash', date: d(2026, 8, 20), categoryIds: ['food'] }),
];
const sep = periodFor('month', d(2026, 9, 10));
const aug = previousPeriod(sep);

describe('balances', () => {
  it('opening + income − expense ± transfers, ignoring deleted', () => {
    const b = walletBalances(wallets, txs);
    // cash: 10000 − 3000 − 1000 − 500 + 10000 − 8000 = 7500
    expect(b.get('cash')).toBe(7_500_00);
    // bankily: 5000 + 45000 − 5000 − 10000 − 50 + 40000 = 74950
    expect(b.get('bankily')).toBe(74_950_00);
    expect(totalBalance(wallets, txs)).toBe(82_450_00);
  });
  it('transfers move money between wallets without changing the total', () => {
    const t = tx({ type: 'transfer', amount: 1_000_00, walletId: 'cash', toWalletId: 'bankily', date: d(2026, 9, 20) });
    expect(totalBalance(wallets, [...txs, t])).toBe(totalBalance(wallets, txs));
    expect(walletBalances(wallets, [...txs, t]).get('cash')).toBe(6_500_00);
  });
  it('balance at a date only counts earlier transactions', () => {
    // start of September: opening 15000 + Aug (40000 − 8000)
    expect(totalBalance(wallets, txs, sep.start)).toBe(47_000_00);
  });
});

describe('totals', () => {
  it('never count transfers as income or expense', () => {
    const t = totalsFor(txs, sep);
    expect(t.income).toBe(45_000_00);
    // 3000 + 1000 + 500 + 5000 + 50 (fee) — the 10000 transfer is excluded
    expect(t.expense).toBe(9_550_00);
    expect(t.net).toBe(35_450_00);
  });
  it('percentage change vs previous period', () => {
    expect(pctChange(150, 100)).toBe(50);
    expect(pctChange(50, 100)).toBe(-50);
    expect(pctChange(0, 0)).toBe(0);
    expect(pctChange(10, 0)).toBeNull();
  });
});

describe('category breakdown', () => {
  it('rolls sub-categories into their parent and counts each split part in its own category', () => {
    const s = byCategory(txs, categories, sep, 'expense');
    const food = s.find((x) => x.categoryId === 'food')!;
    // groceries 3000 + restaurants 1000 + split food 3000
    expect(food.amount).toBe(7_000_00);
    expect(food.children.map((c) => [c.categoryId, c.amount])).toEqual([
      ['groceries', 3_000_00], ['food', 3_000_00], ['restaurants', 1_000_00],
    ]);
    expect(s.find((x) => x.categoryId === 'household')!.amount).toBe(2_000_00);
    expect(s.reduce((a, x) => a + x.amount, 0)).toBe(totalsFor(txs, sep).expense);
    expect(s.reduce((a, x) => a + x.pct, 0)).toBeCloseTo(100);
    expect(s[0].categoryId).toBe('food'); // sorted by amount
  });
});

describe('full report', () => {
  const r = buildReport(wallets, categories, txs, sep, aug);
  it('opening and closing balances are consistent with the net', () => {
    expect(r.closingBalance - r.openingBalance).toBe(r.totals.net);
  });
  it('compares with the previous period', () => {
    expect(r.prevTotals).toEqual({ income: 40_000_00, expense: 8_000_00, net: 32_000_00 });
    expect(r.change.income).toBeCloseTo(12.5);
  });
  it('top expenses are sorted and exclude transfers', () => {
    expect(r.topExpenses[0].amount).toBe(5_000_00);
    expect(r.topExpenses.every((t) => t.type === 'expense' && t.deletedAt == null)).toBe(true);
  });
  it('timeline sums match totals', () => {
    const tl = timeline(txs, sep);
    expect(tl).toHaveLength(30);
    expect(tl.reduce((a, b) => a + b.expense, 0)).toBe(r.totals.expense);
    expect(tl.reduce((a, b) => a + b.income, 0)).toBe(r.totals.income);
    expect(tl[0].income).toBe(45_000_00);
  });
  it('wallet flows', () => {
    const b = r.byWallet.find((w) => w.walletId === 'bankily')!;
    expect(b).toMatchObject({ income: 45_000_00, expense: 5_050_00, transferOut: 10_000_00, transferIn: 0 });
  });
});

describe('search and filters', () => {
  it('filters by category (with sub-categories) and counts only matching split parts', () => {
    const ids = expandCategoryIds(['food'], categories);
    const rows = filterTransactions(txs, { categoryIds: ids, start: sep.start, end: sep.end });
    expect(rows).toHaveLength(3);
    expect(sumFiltered(rows).expense).toBe(7_000_00);
  });
  it('text search in notes and tags, with or without #', () => {
    expect(filterTransactions(txs, { text: 'روصو' })).toHaveLength(1);
    expect(filterTransactions(txs, { text: '#سفر' })).toHaveLength(1);
  });
  it('amount exact and range', () => {
    expect(filterTransactions(txs, { amountMin: 500_00, amountMax: 500_00 })).toHaveLength(1);
    expect(filterTransactions(txs, { amountMin: 1_000_00, amountMax: 5_000_00 }).map((r) => r.tx.amount).sort()).toEqual([1_000_00, 3_000_00, 5_000_00]);
  });
  it('combines filters: transport in September by type and wallet', () => {
    const rows = filterTransactions(txs, { types: ['expense'], walletIds: ['cash'], categoryIds: ['transport'], start: sep.start, end: sep.end });
    expect(sumFiltered(rows).expense).toBe(500_00);
  });
  it('wallet filter matches both sides of a transfer', () => {
    expect(filterTransactions(txs, { types: ['transfer'], walletIds: ['cash'] })).toHaveLength(1);
  });
});
