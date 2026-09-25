// Section 4: "صافي أموالك" under the total balance.
import { describe, expect, it } from 'vitest';
import { EMPTY_DEBT_SUMMARY, netWorth, summarize, type DebtStatus } from '../repo/debts';
import type { Debt } from '../data/types';

const debt = (direction: Debt['direction'], amount: number): Debt => ({
  id: Math.random().toString(), direction, person: 'x', amount, date: 0, dueDate: null, note: '', walletId: null,
  principalTxId: null, closedAt: null, createdAt: 0, updatedAt: 0,
});
const st = (d: Debt, remaining: number, overdue = false, closed = false): DebtStatus =>
  ({ debt: d, paid: d.amount - remaining, remaining, closed, overdue });

describe('net worth', () => {
  it('total + what others owe me − what I owe; the big number itself is unchanged', () => {
    const s = summarize([st(debt('owed_to_me', 5000), 3000), st(debt('i_owe', 2000), 2000), st(debt('owed_to_me', 900), 0, false, true)]);
    expect(s).toMatchObject({ owedToMe: 3000, iOwe: 2000, open: 2 });
    expect(netWorth(10_000, s)).toBe(11_000);
  });

  it('overdue parts are counted separately (shown in another colour)', () => {
    const s = summarize([st(debt('owed_to_me', 5000), 4000, true), st(debt('owed_to_me', 1000), 1000), st(debt('i_owe', 700), 700, true)]);
    expect(s).toMatchObject({ owedToMe: 5000, overdueOwedToMe: 4000, iOwe: 700, overdueIOwe: 700, overdue: 2 });
  });

  it('no debts: nothing to show (open = 0) and net worth = total', () => {
    expect(summarize([])).toEqual(EMPTY_DEBT_SUMMARY);
    expect(netWorth(1234, EMPTY_DEBT_SUMMARY)).toBe(1234);
  });
});
