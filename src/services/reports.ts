// Pure financial calculations. No database access here — everything is testable in isolation.
import { matchQuery, parseQuery, type SearchNames } from './search';
import type { Category, CategoryKind, ID, Transaction, Wallet } from '../data/types';
import { bucketsFor, inPeriod, type Bucket, type Period } from '../lib/period';

const alive = (t: Transaction) => t.deletedAt == null;

/** Effect of one transaction on each wallet's balance. */
export function walletDeltas(t: Transaction): Array<[ID, number]> {
  switch (t.type) {
    case 'income': return [[t.walletId, t.amount]];
    case 'expense': return [[t.walletId, -t.amount]];
    case 'transfer': return t.toWalletId ? [[t.walletId, -t.amount], [t.toWalletId, t.amount]] : [];
  }
}

/** Balance per wallet, counting only transactions strictly before `until` (if given). */
export function walletBalances(wallets: Wallet[], txs: Transaction[], until?: number): Map<ID, number> {
  const m = new Map<ID, number>();
  for (const w of wallets) m.set(w.id, w.openingBalance);
  for (const t of txs) {
    if (!alive(t) || (until != null && t.date >= until)) continue;
    for (const [id, d] of walletDeltas(t)) if (m.has(id)) m.set(id, m.get(id)! + d);
  }
  return m;
}

export function totalBalance(wallets: Wallet[], txs: Transaction[], until?: number): number {
  let s = 0;
  for (const v of walletBalances(wallets, txs, until).values()) s += v;
  return s;
}

export interface Totals { income: number; expense: number; net: number }

/** Income/expense totals in a period. Transfers are never counted. */
export function totalsFor(txs: Transaction[], p: Period): Totals {
  let income = 0, expense = 0;
  for (const t of txs) {
    if (!alive(t) || !inPeriod(t.date, p)) continue;
    if (t.type === 'income') income += t.amount;
    else if (t.type === 'expense') expense += t.amount;
  }
  return { income, expense, net: income - expense };
}

/** Percentage change; null when the previous value is 0 and the current isn't (no meaningful %). */
export function pctChange(cur: number, prev: number): number | null {
  if (prev === 0) return cur === 0 ? 0 : null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

export interface CategorySlice {
  categoryId: ID;
  amount: number;
  pct: number;
  children: Array<{ categoryId: ID; amount: number; pct: number }>;
}

/**
 * Amount per top-level category (sub-categories roll up into their parent, with a breakdown).
 * Split transactions contribute each part to its own category.
 */
export function byCategory(
  txs: Transaction[], categories: Category[], p: Period, kind: CategoryKind,
): CategorySlice[] {
  const catById = new Map(categories.map((c) => [c.id, c]));
  const top = new Map<ID, { amount: number; children: Map<ID, number> }>();
  let total = 0;
  for (const t of txs) {
    if (!alive(t) || t.type !== kind || !inPeriod(t.date, p)) continue;
    for (const s of t.splits) {
      const c = catById.get(s.categoryId);
      const parentId = c?.parentId ?? s.categoryId;
      const e = top.get(parentId) ?? { amount: 0, children: new Map() };
      e.amount += s.amount;
      e.children.set(s.categoryId, (e.children.get(s.categoryId) ?? 0) + s.amount);
      top.set(parentId, e);
      total += s.amount;
    }
  }
  return [...top.entries()]
    .map(([categoryId, e]) => ({
      categoryId,
      amount: e.amount,
      pct: total ? (e.amount / total) * 100 : 0,
      children: [...e.children.entries()]
        .map(([cid, amount]) => ({ categoryId: cid, amount, pct: e.amount ? (amount / e.amount) * 100 : 0 }))
        .sort((a, b) => b.amount - a.amount),
    }))
    .sort((a, b) => b.amount - a.amount);
}

export interface WalletFlow { walletId: ID; income: number; expense: number; transferIn: number; transferOut: number }

export function byWallet(txs: Transaction[], p: Period): WalletFlow[] {
  const m = new Map<ID, WalletFlow>();
  const get = (id: ID) => {
    let e = m.get(id);
    if (!e) m.set(id, (e = { walletId: id, income: 0, expense: 0, transferIn: 0, transferOut: 0 }));
    return e;
  };
  for (const t of txs) {
    if (!alive(t) || !inPeriod(t.date, p)) continue;
    if (t.type === 'income') get(t.walletId).income += t.amount;
    else if (t.type === 'expense') get(t.walletId).expense += t.amount;
    else if (t.toWalletId) {
      get(t.walletId).transferOut += t.amount;
      get(t.toWalletId).transferIn += t.amount;
    }
  }
  return [...m.values()].sort((a, b) => b.expense + b.income - (a.expense + a.income));
}

export interface TimelinePoint extends Bucket { income: number; expense: number }

export function timeline(txs: Transaction[], p: Period): TimelinePoint[] {
  const buckets = bucketsFor(p).map((b) => ({ ...b, income: 0, expense: 0 }));
  for (const t of txs) {
    if (!alive(t) || t.type === 'transfer' || !inPeriod(t.date, p)) continue;
    // buckets are sorted; binary search
    let lo = 0, hi = buckets.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (t.date < buckets[mid].start) hi = mid - 1;
      else if (t.date >= buckets[mid].end) lo = mid + 1;
      else { buckets[mid][t.type] += t.amount; break; }
    }
  }
  return buckets;
}

export function topExpenses(txs: Transaction[], p: Period, n = 10): Transaction[] {
  return txs
    .filter((t) => alive(t) && t.type === 'expense' && inPeriod(t.date, p))
    .sort((a, b) => b.amount - a.amount || b.date - a.date)
    .slice(0, n);
}

export interface Report {
  period: Period;
  previous: Period;
  totals: Totals;
  prevTotals: Totals;
  change: { income: number | null; expense: number | null; net: number | null };
  openingBalance: number;
  closingBalance: number;
  expenseByCategory: CategorySlice[];
  incomeByCategory: CategorySlice[];
  byWallet: WalletFlow[];
  timeline: TimelinePoint[];
  topExpenses: Transaction[];
  txCount: number;
}

export function buildReport(
  wallets: Wallet[], categories: Category[], txs: Transaction[], period: Period, previous: Period,
): Report {
  const totals = totalsFor(txs, period);
  const prevTotals = totalsFor(txs, previous);
  return {
    period, previous, totals, prevTotals,
    change: {
      income: pctChange(totals.income, prevTotals.income),
      expense: pctChange(totals.expense, prevTotals.expense),
      net: pctChange(totals.net, prevTotals.net),
    },
    openingBalance: totalBalance(wallets, txs, period.start),
    closingBalance: totalBalance(wallets, txs, period.end),
    expenseByCategory: byCategory(txs, categories, period, 'expense'),
    incomeByCategory: byCategory(txs, categories, period, 'income'),
    byWallet: byWallet(txs, period),
    timeline: timeline(txs, period),
    topExpenses: topExpenses(txs, period),
    txCount: txs.filter((t) => alive(t) && inPeriod(t.date, period)).length,
  };
}

// ---------- Search / filtering ----------

export interface TxFilter {
  text?: string;
  /** Display names used by the text search (categories, wallets, templates). */
  names?: SearchNames;
  amountMin?: number;
  amountMax?: number;
  start?: number;
  end?: number;
  walletIds?: ID[];
  categoryIds?: ID[];
  types?: Array<Transaction['type']>;
  tags?: string[];
}

/**
 * Filters transactions. When filtering by category, `categoryIds` should already include
 * sub-categories (see expandCategoryIds). Returns each match with the amount that counts
 * toward the filter (only the matching split parts for split transactions).
 */
export function filterTransactions(txs: Transaction[], f: TxFilter): Array<{ tx: Transaction; counted: number }> {
  const query = f.text ? parseQuery(f.text) : null;
  const cats = f.categoryIds?.length ? new Set(f.categoryIds) : null;
  const wallets = f.walletIds?.length ? new Set(f.walletIds) : null;
  const tags = f.tags?.length ? f.tags : null;
  const out: Array<{ tx: Transaction; counted: number }> = [];
  for (const t of txs) {
    if (!alive(t)) continue;
    if (f.start != null && t.date < f.start) continue;
    if (f.end != null && t.date >= f.end) continue;
    if (f.types?.length && !f.types.includes(t.type)) continue;
    if (wallets && !wallets.has(t.walletId) && !(t.toWalletId && wallets.has(t.toWalletId))) continue;
    if (tags && !tags.every((tg) => t.tags.includes(tg))) continue;
    let counted = t.amount;
    if (f.amountMin != null || f.amountMax != null) {
      // The whole amount or any split part may fall in the range.
      const inRange = (v: number) => (f.amountMin == null || v >= f.amountMin) && (f.amountMax == null || v <= f.amountMax);
      if (!inRange(t.amount)) {
        const parts = t.splits.filter((s) => inRange(s.amount));
        if (!parts.length) continue;
        counted = parts.reduce((a, s) => a + s.amount, 0);
      }
    }
    if (query) {
      const hit = matchQuery(t, query, f.names);
      if (hit == null) continue;
      counted = Math.min(counted, hit);
    }
    if (cats) {
      const parts = t.splits.filter((s) => cats.has(s.categoryId));
      if (!parts.length) continue;
      counted = parts.reduce((a, s) => a + s.amount, 0);
    }
    out.push({ tx: t, counted });
  }
  return out;
}

export function expandCategoryIds(ids: ID[], categories: Category[]): ID[] {
  const set = new Set(ids);
  for (const c of categories) if (c.parentId && set.has(c.parentId)) set.add(c.id);
  return [...set];
}

export function sumFiltered(rows: Array<{ tx: Transaction; counted: number }>): Totals & { transfers: number } {
  let income = 0, expense = 0, transfers = 0;
  for (const { tx, counted } of rows) {
    if (tx.type === 'income') income += counted;
    else if (tx.type === 'expense') expense += counted;
    else transfers += counted;
  }
  return { income, expense, net: income - expense, transfers };
}
