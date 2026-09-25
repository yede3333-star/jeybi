import { beforeEach, describe, expect, it } from 'vitest';
import { addDays } from 'date-fns';
import { db } from '../data/db';
import type { Category, Transaction } from '../data/types';
import { initDatabase, wipeAll } from '../repo/init';
import { createTransaction, deleteTransaction, listActive, restoreTransaction, ValidationError } from '../repo/transactions';
import { computeFlows, FLOWS_KEY } from '../repo/flows';
import { getBalances } from '../repo/summary';
import { addRepayment, createDebt, debtSummary, getDebt, listDebts, removeDebt, updateDebt } from '../repo/debts';
import { budgetStatuses, checkBudgetAlerts, copyPreviousMonth, listBudgets, monthKey, setBudget } from '../repo/budgets';
import { confirmPending, dismissPending, dueOccurrences, listPending, occurrenceDate, runRecurring, saveRecurring, setRecurringActive, type RecurringInput } from '../repo/recurring';
import { goalProgress, listGoals, moveGoalMoney, getReserved, saveGoal, removeGoal } from '../repo/goals';
import { reconcile, walletsToReconcile } from '../repo/reconcile';
import { recordZakatPayment, updateZakatSettings, zakatSnapshot } from '../repo/zakat';
import { getSettings } from '../repo/settings';
import { parseRate, rateToString, toBase } from '../services/currency';
import { computeInsights } from '../services/insights';
import { computeZakat, formatHijri, hawlEnd, hawlStatus, hijri } from '../services/zakat';
import { byWallet, timeline, totalsFor, walletBalances } from '../services/reports';
import { periodFor } from '../lib/period';

const DAY = 86_400_000;
const now = new Date(2026, 8, 24, 12).getTime();
let cash: string, bankily: string, food: string, transport: string, groceries: string, salary: string, rent: string;

beforeEach(async () => {
  await wipeAll();
  await initDatabase();
  const w = await db.wallets.toArray();
  const c = await db.categories.toArray();
  cash = w.find((x) => x.sysKey === 'cash')!.id;
  bankily = w.find((x) => x.sysKey === 'bankily')!.id;
  const k = (s: string) => c.find((x) => x.sysKey === s)!.id;
  food = k('food'); transport = k('transport'); groceries = k('groceries'); salary = k('salary'); rent = k('rent');
});

async function expectCacheConsistent() {
  const nz = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== 0));
  expect(nz((await db.meta.get(FLOWS_KEY))!.value as Record<string, number>)).toEqual(nz(await computeFlows()));
}
const bal = async (id: string) => (await getBalances()).byWallet.get(id);

// ---------------------------------------------------------------- currencies
describe('multi-currency', () => {
  it('converts with integer math, rounding half away from zero', () => {
    expect(toBase(100_00, parseRate('43.25')!)).toBe(4_325_00); // 100 € × 43.25
    expect(toBase(1, 5000)).toBe(1); // 0.01 × 0.5 = 0.005 → 0.01
    expect(toBase(1, 4999)).toBe(0);
    expect(toBase(-1, 5000)).toBe(-1);
    expect(toBase(999_999_999_99, 999_999_9999)).toBe(Number((99999999999n * 9999999999n + 5000n) / 10000n)); // no float loss
  });
  it('parses rates in all formats', () => {
    for (const s of ['43.25', '43,25', '٤٣٫٢٥', ' 43.2500 ']) expect(parseRate(s)).toBe(432_500);
    expect(parseRate('40')).toBe(400_000);
    expect(parseRate('1.23456')).toBeNull();
    expect(parseRate('0')).toBeNull();
    expect(rateToString(432_500)).toBe('43.25');
    expect(rateToString(400_000)).toBe('40');
  });
  it('stores the original currency, amount and rate; balances and reports are in base', async () => {
    const rate = parseRate('43.25')!;
    const { tx } = await createTransaction({ type: 'expense', amount: toBase(20_00, rate), walletId: cash, categoryId: food, date: now,
      origCurrency: 'EUR', origAmount: 20_00, rateE4: rate });
    expect(tx).toMatchObject({ amount: 865_00, origCurrency: 'EUR', origAmount: 20_00, rateE4: 432_500 });
    expect(await bal(cash)).toBe(-865_00);
    expect(totalsFor(await listActive(), periodFor('month', now)).expense).toBe(865_00);
  });
  it('rejects an amount that does not match the conversion', async () => {
    await expect(createTransaction({ type: 'expense', amount: 800_00, walletId: cash, categoryId: food, date: now,
      origCurrency: 'EUR', origAmount: 20_00, rateE4: 432_500 })).rejects.toMatchObject({ code: 'rate' });
  });
});

// ---------------------------------------------------------------- debts
describe('debts', () => {
  it('lending takes money out, repayments bring it back; never income or expense', async () => {
    const { debt } = await createDebt({ direction: 'owed_to_me', person: 'محمد', amount: 5_000_00, date: now, dueDate: null, note: '', walletId: cash });
    expect(await bal(cash)).toBe(-5_000_00);
    await addRepayment(debt.id, { amount: 2_000_00, walletId: bankily, date: now });
    expect(await bal(bankily)).toBe(2_000_00);
    const all = await listActive();
    expect(totalsFor(all, periodFor('month', now))).toEqual({ income: 0, expense: 0, net: 0 });
    expect(timeline(all, periodFor('month', now)).reduce((a, b) => a + b.income + b.expense, 0)).toBe(0);
    expect(byWallet(all, periodFor('month', now)).find((w) => w.walletId === cash)).toMatchObject({ debtOut: 5_000_00, income: 0, expense: 0 });
    await expectCacheConsistent();
  });

  it('multiple partial repayments, remaining, auto close, reopen when a repayment is deleted', async () => {
    const { debt } = await createDebt({ direction: 'i_owe', person: 'أحمد', amount: 3_000_00, date: now, dueDate: null, note: '', walletId: bankily });
    expect(await bal(bankily)).toBe(3_000_00); // borrowed money came in
    await addRepayment(debt.id, { amount: 1_000_00, walletId: bankily, date: now });
    let d = (await getDebt(debt.id))!;
    expect(d.status).toMatchObject({ paid: 1_000_00, remaining: 2_000_00, closed: false });
    const second = await addRepayment(debt.id, { amount: 2_000_00, walletId: cash, date: now });
    d = (await getDebt(debt.id))!;
    expect(d.status).toMatchObject({ remaining: 0, closed: true });
    expect((await db.debts.get(debt.id))!.closedAt).not.toBeNull();
    await expect(addRepayment(debt.id, { amount: 1, walletId: cash, date: now })).rejects.toMatchObject({ code: 'overpay' });
    await second.undo();
    expect((await db.debts.get(debt.id))!.closedAt).toBeNull();
    // deleting a repayment from the transactions list also reopens it, restoring closes it again
    const r = await addRepayment(debt.id, { amount: 2_000_00, walletId: cash, date: now });
    void r;
    const pay = (await db.transactions.where('debtId').equals(debt.id).toArray()).find((t) => t.amount === 2_000_00 && t.deletedAt == null)!;
    await deleteTransaction(pay.id);
    expect((await db.debts.get(debt.id))!.closedAt).toBeNull();
    await restoreTransaction(pay.id);
    expect((await db.debts.get(debt.id))!.closedAt).not.toBeNull();
    await expectCacheConsistent();
  });

  it('a debt recorded without a wallet does not move money; summary and overdue', async () => {
    await createDebt({ direction: 'owed_to_me', person: 'سيدي', amount: 10_000_00, date: now - 60 * DAY, dueDate: now - DAY, note: 'قديم', walletId: null });
    await createDebt({ direction: 'i_owe', person: 'Fatima', amount: 1_500_00, date: now, dueDate: now + 10 * DAY, note: '', walletId: cash });
    expect(await bal(cash)).toBe(1_500_00);
    const s = await debtSummary();
    expect(s).toEqual({ owedToMe: 10_000_00, iOwe: 1_500_00, overdue: 1, open: 2, overdueOwedToMe: 10_000_00, overdueIOwe: 0 });
    expect((await listDebts())[0].debt.person).toBe('سيدي'); // overdue first
  });

  it('editing the principal moves the wallet accordingly; delete + undo', async () => {
    const { debt } = await createDebt({ direction: 'owed_to_me', person: 'Ali', amount: 1_000_00, date: now, dueDate: null, note: '', walletId: cash });
    await updateDebt(debt.id, { direction: 'owed_to_me', person: 'Ali', amount: 1_500_00, date: now, dueDate: null, note: '', walletId: bankily });
    expect(await bal(cash)).toBe(0);
    expect(await bal(bankily)).toBe(-1_500_00);
    const { undo } = await removeDebt(debt.id);
    expect(await bal(bankily)).toBe(0);
    expect(await db.debts.count()).toBe(0);
    await undo();
    expect(await bal(bankily)).toBe(-1_500_00);
    await expectCacheConsistent();
  });

  it('debt movements cannot be created through the normal editor path', async () => {
    await expect(createTransaction({ type: 'debt', amount: 100, walletId: cash, date: now })).rejects.toBeInstanceOf(ValidationError);
  });
});

// ---------------------------------------------------------------- budgets
describe('budgets', () => {
  const cats: Category[] = [
    { id: 'food', kind: 'expense', parentId: null, name: '', color: '', icon: '', archived: false, order: 0, createdAt: 0, updatedAt: 0 },
    { id: 'groc', kind: 'expense', parentId: 'food', name: '', color: '', icon: '', archived: false, order: 0, createdAt: 0, updatedAt: 0 },
    { id: 'taxi', kind: 'expense', parentId: null, name: '', color: '', icon: '', archived: false, order: 0, createdAt: 0, updatedAt: 0 },
  ];
  const t = (amount: number, splits: Array<[string, number]>, extra: Partial<Transaction> = {}): Transaction => ({
    id: String(Math.random()), type: 'expense', amount, walletId: 'w', splits: splits.map(([categoryId, a]) => ({ categoryId, amount: a })),
    categoryIds: splits.map(([c]) => c), date: now, note: '', tags: [], currency: 'MRU', createdAt: 0, updatedAt: 0, deletedAt: null, ...extra,
  });

  it('parent budgets include sub-categories and split parts; levels at 80 and 100', () => {
    const s = budgetStatuses(
      [{ id: 'm:food', month: 'm', categoryId: 'food', amount: 1_000_00 }, { id: 'm:groc', month: 'm', categoryId: 'groc', amount: 500_00 }, { id: 'm:taxi', month: 'm', categoryId: 'taxi', amount: 1_000_00 }],
      [t(500_00, [['food', 200_00], ['groc', 300_00]]), t(100_00, [['groc', 100_00]]), t(900_00, [['taxi', 900_00]]), t(5_000_00, [['taxi', 5_000_00]], { deletedAt: 1 })],
      cats,
    );
    const by = Object.fromEntries(s.map((x) => [x.budget.categoryId, x]));
    expect(by.food).toMatchObject({ spent: 600_00, level: 0 });
    expect(by.groc).toMatchObject({ spent: 400_00, level: 80 });
    expect(by.taxi).toMatchObject({ spent: 900_00, level: 80 });
  });

  it('alerts once at 80% and once at 100%, and copies last month', async () => {
    const month = monthKey(Date.now());
    await setBudget(month, transport, 1_000_00);
    await createTransaction({ type: 'expense', amount: 850_00, walletId: cash, categoryId: transport, date: Date.now() });
    expect((await checkBudgetAlerts()).map((s) => s.level)).toEqual([80]);
    expect(await checkBudgetAlerts()).toEqual([]); // not again
    await createTransaction({ type: 'expense', amount: 200_00, walletId: cash, categoryId: transport, date: Date.now() });
    expect((await checkBudgetAlerts()).map((s) => s.level)).toEqual([100]);
    expect(await checkBudgetAlerts()).toEqual([]);

    await setBudget('2025-01', food, 3_000_00);
    await setBudget('2025-01', rent, 9_000_00);
    await setBudget('2025-02', food, 3_500_00);
    expect(await copyPreviousMonth('2025-02')).toBe(1);
    const sep = await listBudgets('2025-02');
    expect(sep.find((b) => b.categoryId === food)!.amount).toBe(3_500_00); // kept
    expect(sep.find((b) => b.categoryId === rent)!.amount).toBe(9_000_00);
    await setBudget('2025-02', rent, 0);
    expect(await listBudgets('2025-02')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------- recurring
describe('recurring transactions', () => {
  const rule = (over: Partial<RecurringInput>): RecurringInput => ({
    name: 'إيجار', type: 'expense', amount: 9_000_00, walletId: cash, categoryId: rent, note: '', tags: [],
    frequency: 'monthly', startDate: new Date(2026, 0, 31, 9).getTime(), endDate: null, mode: 'auto', active: true, ...over,
  });

  it('monthly on the 31st clamps per month without drifting', () => {
    const s = new Date(2026, 0, 31, 9).getTime();
    expect([0, 1, 2, 3].map((n) => new Date(occurrenceDate(s, 'monthly', n)).getDate())).toEqual([31, 28, 31, 30]);
    expect(new Date(occurrenceDate(new Date(2028, 1, 29).getTime(), 'yearly', 1)).getDate()).toBe(28);
  });

  it('generates what is due once — never twice, however many times the app opens', async () => {
    const r = await saveRecurring(rule({ startDate: Date.now() - 2 * DAY, frequency: 'daily', amount: 100_00, categoryId: transport }));
    // creation does not back-fill before today, but today is due
    const first = await runRecurring();
    expect(first.created).toBe(1);
    for (let i = 0; i < 5; i++) expect((await runRecurring()).created).toBe(0);
    // a week later (app not opened): catches up 7 days, once
    const later = Date.now() + 7 * DAY;
    expect((await runRecurring(later)).created).toBe(7);
    expect((await runRecurring(later)).created).toBe(0);
    const keys = (await listActive()).map((t) => t.recurringKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.every((k) => k?.startsWith(r.id))).toBe(true);
    await expectCacheConsistent();
  });

  it('deleted occurrences are not recreated', async () => {
    await saveRecurring(rule({ startDate: Date.now() - DAY, frequency: 'daily', amount: 100_00 }));
    await runRecurring();
    const tx = (await listActive())[0];
    await deleteTransaction(tx.id);
    await runRecurring();
    expect(await listActive()).toHaveLength(0);
  });

  it('confirmation mode queues occurrences; confirm records, dismiss drops, none come back', async () => {
    await saveRecurring(rule({ startDate: Date.now(), frequency: 'weekly', mode: 'confirm', type: 'income', categoryId: salary, amount: 1_000_00 }));
    const t2 = Date.now() + 8 * DAY;
    expect(await runRecurring(t2)).toEqual({ created: 0, pending: 2 });
    expect(await runRecurring(t2)).toEqual({ created: 0, pending: 0 });
    const [a, b] = await listPending();
    await confirmPending(a.id);
    await dismissPending(b.id);
    expect(await listPending()).toHaveLength(0);
    expect((await listActive()).map((x) => x.type)).toEqual(['income']);
    await runRecurring(t2);
    expect(await listActive()).toHaveLength(1);
  });

  it('respects the end date, and pausing skips what was missed', async () => {
    const r = await saveRecurring(rule({ startDate: Date.now(), frequency: 'daily', amount: 10_00, endDate: Date.now() + 2 * DAY }));
    expect((await runRecurring(Date.now() + 30 * DAY)).created).toBe(3);
    await setRecurringActive(r.id, false);
    const r2 = await saveRecurring(rule({ startDate: Date.now(), frequency: 'daily', amount: 10_00 }));
    await setRecurringActive(r2.id, false);
    expect((await runRecurring(Date.now() + 5 * DAY)).created).toBe(0);
    expect(dueOccurrences((await db.recurring.get(r2.id))!, Date.now() + 5 * DAY).length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------- goals
describe('savings goals', () => {
  it('progress and the monthly amount needed', () => {
    const g = { id: 'g', name: 'خروف العيد', target: 60_000_00, targetDate: new Date(2026, 11, 31).getTime(), icon: 'target', color: '#000', archived: false, createdAt: 0 };
    const p = goalProgress(g, [{ id: '1', goalId: 'g', walletId: 'w', amount: 20_000_00, date: now, note: '' }], now);
    expect(p).toMatchObject({ saved: 20_000_00, remaining: 40_000_00, monthsLeft: 4, monthlyNeeded: 10_000_00, reached: false });
    expect(Math.round(p.pct)).toBe(33);
    expect(goalProgress({ ...g, targetDate: null }, [], now).monthlyNeeded).toBeNull();
  });

  it('reserved money stays in the wallet; limited by free balance and by what the goal holds', async () => {
    await createTransaction({ type: 'income', amount: 10_000_00, walletId: bankily, categoryId: salary, date: now });
    const g = await saveGoal({ name: 'هاتف جديد', target: 15_000_00, targetDate: null, icon: 'smartphone', color: '#2563eb' });
    await moveGoalMoney(g.id, bankily, 6_000_00);
    expect(await bal(bankily)).toBe(10_000_00); // unchanged
    expect((await getReserved()).get(bankily)).toBe(6_000_00);
    await expect(moveGoalMoney(g.id, bankily, 5_000_00)).rejects.toMatchObject({ code: 'notEnoughFree' });
    await expect(moveGoalMoney(g.id, bankily, -7_000_00)).rejects.toMatchObject({ code: 'notEnoughSaved' });
    await moveGoalMoney(g.id, bankily, -1_000_00);
    expect((await listGoals())[0]).toMatchObject({ saved: 5_000_00, remaining: 10_000_00 });
    const { undo } = await removeGoal(g.id);
    expect((await getReserved()).get(bankily) ?? 0).toBe(0);
    await undo();
    expect((await getReserved()).get(bankily)).toBe(5_000_00);
  });
});

// ---------------------------------------------------------------- reconciliation
describe('balance reconciliation', () => {
  it('shows the difference and records it as an unrecorded expense or income', async () => {
    await createTransaction({ type: 'income', amount: 5_000_00, walletId: cash, categoryId: salary, date: now });
    const r1 = await reconcile(cash, 4_700_00, true);
    expect(r1.diff).toBe(-300_00);
    expect(await bal(cash)).toBe(4_700_00);
    const adj = (await listActive()).find((t) => t.adjustment)!;
    expect(adj).toMatchObject({ type: 'expense', amount: 300_00 });
    expect((await db.categories.get(adj.splits[0].categoryId))!.sysKey).toBe('adjustment_expense');
    const r2 = await reconcile(cash, 5_000_00, true);
    expect(r2.diff).toBe(300_00);
    expect(await bal(cash)).toBe(5_000_00);
    expect((await db.wallets.get(cash))!.lastReconciledAt).toBeTruthy();
    // only reviewing: nothing recorded, not marked
    const r3 = await reconcile(bankily, 100_00, false);
    expect(r3.diff).toBe(100_00);
    expect((await db.wallets.get(bankily))!.lastReconciledAt).toBeUndefined();
  });

  it('reminds for wallets not checked for more than two weeks', async () => {
    const w = await db.wallets.toArray();
    const balances = new Map([[cash, 100_00], [bankily, 0]]);
    const due = walletsToReconcile(w, balances, now - 30 * DAY, now);
    expect(due.map((x) => x.id)).toEqual([cash]); // bankily is empty
    expect(walletsToReconcile(w.map((x) => ({ ...x, lastReconciledAt: now - 3 * DAY })), balances, now - 30 * DAY, now)).toEqual([]);
  });
});

// ---------------------------------------------------------------- insights
describe('smart insights', () => {
  const cats: Category[] = [
    { id: 'food', kind: 'expense', parentId: null, name: '', color: '', icon: '', archived: false, order: 0, createdAt: 0, updatedAt: 0 },
    { id: 'taxi', kind: 'expense', parentId: null, name: '', color: '', icon: '', archived: false, order: 0, createdAt: 0, updatedAt: 0 },
  ];
  const e = (daysAgo: number, cat: string, amount: number): Transaction => ({
    id: `${daysAgo}${cat}${amount}`, type: 'expense', amount, walletId: 'w', splits: [{ categoryId: cat, amount }], categoryIds: [cat],
    date: now - daysAgo * DAY, note: '', tags: [], currency: 'MRU', createdAt: 0, updatedAt: 0, deletedAt: null,
  });

  it('shows nothing without enough data', () => {
    const r = computeInsights({ txs: [e(1, 'food', 100_00)], categories: cats, totalBalance: 0, firstTxDate: now - DAY, now, thresholdPct: 30 });
    expect(r).toEqual({ avgDaily: null, forecast: null, notes: [] });
  });

  it('average per day, month-end forecast, and only significant category notes (max 3)', () => {
    const txs: Transaction[] = [];
    for (let d = 0; d < 36; d++) txs.push(e(d, 'food', 1_000_00), e(d, 'taxi', 150_00));
    for (let d = 0; d < 7; d++) txs.push(e(d, 'food', 500_00)); // +50% on food in the last 7 days
    const r = computeInsights({ txs, categories: cats, totalBalance: 100_000_00, firstTxDate: now - 60 * DAY, now, thresholdPct: 30 });
    // Sep 1..24 = 24 days; daily = 1150 + (500 for the last 7 days)
    const exact = (24 * 1_150_00 + 7 * 500_00) / 24;
    expect(r.avgDaily).toBe(Math.round(exact / 100) * 100); // whole ouguiyas
    expect(r.forecast).toBe(Math.round((100_000_00 - exact * 6) / 100) * 100);
    expect(r.notes).toEqual([{ categoryId: 'food', last7: 7 * 1_500_00, weeklyAvg: 7 * 1_000_00, diffPct: 50 }]);
    // an irregular category (2 of 4 weeks) never produces a note
    const irregular = [...txs.filter((x) => x.splits[0].categoryId !== 'taxi'), e(10, 'taxi', 2_000_00), e(20, 'taxi', 2_000_00)];
    expect(computeInsights({ txs: irregular, categories: cats, totalBalance: 0, firstTxDate: now - 60 * DAY, now, thresholdPct: 30 }).notes.map((n) => n.categoryId)).toEqual(['food']);
    const high = computeInsights({ txs, categories: cats, totalBalance: 0, firstTxDate: now - 60 * DAY, now, thresholdPct: 60 });
    expect(high.notes).toEqual([]);
  });
});

// ---------------------------------------------------------------- zakat
describe('zakat', () => {
  it('nisab, receivables/payables and 2.5% with integer rounding', () => {
    const base = { walletBalances: [300_000_00, 50_000_00], receivables: 20_000_00, payables: 10_000_00, includeReceivables: true, subtractPayables: true, basis: 'gold' as const, gramPrice: 3_500_00 };
    const r = computeZakat(base);
    expect(r).toMatchObject({ cash: 350_000_00, total: 360_000_00, nisab: 297_500_00, reached: true, due: 9_000_00 });
    expect(computeZakat({ ...base, includeReceivables: false, subtractPayables: false }).total).toBe(350_000_00);
    expect(computeZakat({ ...base, walletBalances: [100_000_00], receivables: 0 }).reached).toBe(false);
    expect(computeZakat({ ...base, basis: 'silver', gramPrice: 45_00 }).nisab).toBe(26_775_00); // 595 g
    expect(computeZakat({ ...base, walletBalances: [300_000_33], receivables: 0, payables: 0 }).due).toBe(7_500_01); // 7500.00825 → 7500.01
    expect(computeZakat({ ...base, gramPrice: 0 }).reached).toBe(false); // no price → no verdict
  });

  it('hawl: one lunar year on the Umm al-Qura calendar', () => {
    const start = new Date(2025, 2, 1).getTime(); // 1 Ramadan 1446
    const h = hijri(start);
    expect(h).toEqual({ y: 1446, m: 9, d: 1 });
    const end = hawlEnd(start);
    expect(hijri(end)).toEqual({ y: 1447, m: 9, d: 1 });
    const days = Math.round((end - start) / DAY);
    expect(days).toBeGreaterThanOrEqual(353);
    expect(days).toBeLessThanOrEqual(356);
    expect(hawlStatus(start, end - DAY)!.complete).toBe(false);
    expect(hawlStatus(start, end)!.complete).toBe(true);
    expect(formatHijri(start, 'ar')).toMatch(/1446/);
    expect(formatHijri(start, 'ar')).not.toMatch(/[٠-٩]/);
  });

  it('recording the payment creates a zakat expense and starts the next hawl', async () => {
    await createTransaction({ type: 'income', amount: 400_000_00, walletId: bankily, categoryId: salary, date: now - 400 * DAY });
    const start = now - 360 * DAY;
    await updateZakatSettings({ gramPriceGold: 3_500_00, hawlStart: start });
    const snap = await zakatSnapshot(now);
    expect(snap.result).toMatchObject({ reached: true, due: 10_000_00 });
    expect(snap.hawl!.complete).toBe(true);
    await recordZakatPayment(bankily, snap.result.due, 'زكاة', now);
    const tx = (await listActive())[0];
    expect((await db.categories.get(tx.splits[0].categoryId))!.sysKey).toBe('zakat');
    expect((await getSettings()).zakat.hawlStart).toBe(snap.hawl!.end);
    // debts count in the calculation
    await createDebt({ direction: 'owed_to_me', person: 'X', amount: 50_000_00, date: now, dueDate: null, note: '', walletId: null });
    expect((await zakatSnapshot(now)).result.receivables).toBe(50_000_00);
  });
});

describe('everything together keeps balances exact', () => {
  it('cache equals a full recomputation after mixed phase-2 operations', async () => {
    const { debt } = await createDebt({ direction: 'owed_to_me', person: 'A', amount: 1_000_00, date: now, dueDate: null, note: '', walletId: cash });
    await addRepayment(debt.id, { amount: 400_00, walletId: cash, date: now });
    await saveRecurring({ name: 'x', type: 'expense', amount: 50_00, walletId: bankily, categoryId: food, note: '', tags: [], frequency: 'daily', startDate: Date.now(), endDate: null, mode: 'auto', active: true });
    await runRecurring(Date.now() + 3 * DAY);
    await reconcile(cash, 0, true);
    await expectCacheConsistent();
    const all = await db.transactions.toArray();
    expect(Object.fromEntries((await getBalances()).byWallet)).toEqual(Object.fromEntries(walletBalances(await db.wallets.toArray(), all)));
    void groceries; void addDays;
  });
});
