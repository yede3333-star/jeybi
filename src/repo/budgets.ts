// Monthly budget per expense category, with in-app alerts at 80% and 100%.
import { format, parse, subMonths } from 'date-fns';
import { db } from '../data/db';
import type { Budget, Category, ID, Transaction } from '../data/types';
import { getSettings, setSettings } from './settings';
import { MAX_AMOUNT, ValidationError } from './transactions';

export const monthKey = (ms: number) => format(ms, 'yyyy-MM');
export const monthRange = (month: string) => {
  const start = parse(`${month}-01`, 'yyyy-MM-dd', new Date());
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
  return { start: +start, end: +end };
};
export const budgetId = (month: string, categoryId: ID) => `${month}:${categoryId}`;

export interface BudgetStatus {
  budget: Budget;
  spent: number;
  pct: number;
  /** 0 below 80%, 80 from 80%, 100 from 100%. */
  level: 0 | 80 | 100;
}

/**
 * Spending per budget. A budget on a parent category includes its sub-categories; a budget on a
 * sub-category counts only that sub-category. Split parts count in their own category.
 */
export function budgetStatuses(budgets: Budget[], txs: Transaction[], categories: Category[]): BudgetStatus[] {
  const parent = new Map(categories.map((c) => [c.id, c.parentId]));
  const spent = new Map<ID, number>();
  for (const t of txs) {
    if (t.deletedAt != null || t.type !== 'expense') continue;
    for (const s of t.splits) {
      spent.set(s.categoryId, (spent.get(s.categoryId) ?? 0) + s.amount);
      const p = parent.get(s.categoryId);
      if (p) spent.set(`parent:${p}`, (spent.get(`parent:${p}`) ?? 0) + s.amount);
    }
  }
  return budgets.map((b) => {
    const isParent = !parent.get(b.categoryId);
    const v = (spent.get(b.categoryId) ?? 0) + (isParent ? spent.get(`parent:${b.categoryId}`) ?? 0 : 0);
    const pct = b.amount > 0 ? (v / b.amount) * 100 : 0;
    const level: BudgetStatus['level'] = pct >= 100 ? 100 : pct >= 80 ? 80 : 0;
    return { budget: b, spent: v, pct, level };
  }).sort((a, b) => b.pct - a.pct);
}

export async function listBudgets(month: string): Promise<Budget[]> {
  return db.budgets.where('month').equals(month).toArray();
}

/** Statuses for a month — reads only that month's transactions (date index). */
export async function monthBudgetStatuses(month: string): Promise<BudgetStatus[]> {
  const budgets = await listBudgets(month);
  if (!budgets.length) return [];
  const { start, end } = monthRange(month);
  const [txs, categories] = await Promise.all([
    db.transactions.where('date').between(start, end, true, false).toArray(),
    db.categories.toArray(),
  ]);
  return budgetStatuses(budgets, txs, categories);
}

export async function setBudget(month: string, categoryId: ID, amount: number, demo = false): Promise<void> {
  if (amount > MAX_AMOUNT) throw new ValidationError('tooLarge');
  const id = budgetId(month, categoryId);
  if (!amount || amount <= 0) await db.budgets.delete(id);
  else await db.budgets.put({ id, month, categoryId, amount, ...(demo ? { demo: true } : {}) });
}

/** Copies last month's budgets into `month` (existing ones are kept). Returns how many were added. */
export async function copyPreviousMonth(month: string): Promise<number> {
  const prev = monthKey(+subMonths(monthRange(month).start, 1));
  return db.transaction('rw', db.budgets, async () => {
    const [previous, current] = await Promise.all([listBudgets(prev), listBudgets(month)]);
    const have = new Set(current.map((b) => b.categoryId));
    const add = previous.filter((b) => !have.has(b.categoryId)).map((b) => ({ id: budgetId(month, b.categoryId), month, categoryId: b.categoryId, amount: b.amount }));
    await db.budgets.bulkPut(add);
    return add.length;
  });
}

/**
 * Returns budgets that newly crossed 80% or 100% since the last check, and remembers them so each
 * alert is shown once per month and level.
 */
export async function checkBudgetAlerts(now = Date.now()): Promise<BudgetStatus[]> {
  const month = monthKey(now);
  const statuses = await monthBudgetStatuses(month);
  if (!statuses.length) return [];
  const { budgetAlerts } = await getSettings();
  const fresh = statuses.filter((s) => s.level > (budgetAlerts[s.budget.id] ?? 0));
  if (fresh.length) {
    const next = Object.fromEntries(Object.entries(budgetAlerts).filter(([k]) => k.startsWith(month)));
    for (const s of statuses) if (s.level) next[s.budget.id] = Math.max(next[s.budget.id] ?? 0, s.level);
    await setSettings({ budgetAlerts: next });
  }
  return fresh;
}
