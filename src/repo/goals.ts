// Savings goals. Money set aside stays in its wallet (no transaction, balances unchanged) but is
// shown as "reserved" so it doesn't look available for spending.
import { differenceInCalendarMonths } from 'date-fns';
import { db } from '../data/db';
import type { Goal, GoalMove, ID } from '../data/types';
import { uid } from '../lib/id';
import { getBalances } from './summary';
import { ValidationError, type Undo } from './transactions';

export interface GoalProgress {
  goal: Goal;
  saved: number;
  remaining: number;
  pct: number;
  reached: boolean;
  /** Needed per month to reach the target by its date (null without a date or once reached). */
  monthlyNeeded: number | null;
  monthsLeft: number | null;
  late: boolean;
}

export function goalProgress(goal: Goal, moves: GoalMove[], now = Date.now()): GoalProgress {
  const saved = moves.filter((m) => m.goalId === goal.id).reduce((a, m) => a + m.amount, 0);
  const remaining = Math.max(0, goal.target - saved);
  const reached = remaining === 0;
  let monthlyNeeded: number | null = null, monthsLeft: number | null = null, late = false;
  if (goal.targetDate != null && !reached) {
    if (goal.targetDate <= now) late = true;
    // Months left including the current one (at least 1): target in 3½ months → 4 payments.
    monthsLeft = Math.max(1, differenceInCalendarMonths(goal.targetDate, now) + (new Date(goal.targetDate).getDate() >= new Date(now).getDate() ? 1 : 0));
    monthlyNeeded = Math.ceil(remaining / monthsLeft);
  }
  return { goal, saved, remaining, pct: goal.target ? Math.min(100, (saved / goal.target) * 100) : 0, reached, monthlyNeeded, monthsLeft, late };
}

/** Reserved amount per wallet (all goals). */
export function reservedByWallet(moves: GoalMove[]): Map<ID, number> {
  const m = new Map<ID, number>();
  for (const mv of moves) m.set(mv.walletId, (m.get(mv.walletId) ?? 0) + mv.amount);
  return m;
}

export async function listGoals(): Promise<GoalProgress[]> {
  const [goals, moves] = await Promise.all([db.goals.toArray(), db.goalMoves.toArray()]);
  const now = Date.now();
  return goals.map((g) => goalProgress(g, moves, now))
    .sort((a, b) => Number(a.goal.archived) - Number(b.goal.archived) || Number(a.reached) - Number(b.reached) || a.goal.createdAt - b.goal.createdAt);
}

export async function goalMovesOf(goalId: ID): Promise<GoalMove[]> {
  return (await db.goalMoves.where('goalId').equals(goalId).toArray()).sort((a, b) => b.date - a.date);
}

export async function getReserved(): Promise<Map<ID, number>> {
  return reservedByWallet(await db.goalMoves.toArray());
}

export async function saveGoal(data: Omit<Goal, 'id' | 'createdAt' | 'archived'> & { id?: ID; archived?: boolean; demo?: boolean }): Promise<Goal> {
  if (!data.name.trim()) throw new ValidationError('name');
  if (!Number.isInteger(data.target) || data.target <= 0) throw new ValidationError('amount');
  const existing = data.id ? await db.goals.get(data.id) : undefined;
  const goal: Goal = { ...existing, ...data, name: data.name.trim(), id: existing?.id ?? uid(), archived: data.archived ?? existing?.archived ?? false, createdAt: existing?.createdAt ?? Date.now() };
  await db.goals.put(goal);
  return goal;
}

/**
 * Sets money aside (+) or takes it back (−). Setting aside is limited to the wallet's free
 * (unreserved) balance; taking back is limited to what this goal holds in that wallet.
 */
export async function moveGoalMoney(goalId: ID, walletId: ID, amount: number, date = Date.now(), note = '', demo = false): Promise<{ undo: Undo }> {
  if (!Number.isInteger(amount) || amount === 0) throw new ValidationError('amount');
  const id = uid();
  await db.transaction('rw', [db.goalMoves, db.goals, db.wallets, db.meta, db.transactions], async () => {
    if (!(await db.goals.get(goalId))) throw new ValidationError('notFound');
    const moves = await db.goalMoves.toArray();
    if (amount > 0) {
      const balance = (await getBalances()).byWallet.get(walletId) ?? 0;
      const free = balance - (reservedByWallet(moves).get(walletId) ?? 0);
      if (amount > free) throw new ValidationError('notEnoughFree');
    } else {
      const held = moves.filter((m) => m.goalId === goalId && m.walletId === walletId).reduce((a, m) => a + m.amount, 0);
      if (-amount > held) throw new ValidationError('notEnoughSaved');
    }
    await db.goalMoves.add({ id, goalId, walletId, amount, date, note: note.trim(), ...(demo ? { demo: true } : {}) });
  });
  return { undo: () => db.goalMoves.delete(id) };
}

/** Deletes a goal; its reserved money becomes free again. */
export async function removeGoal(id: ID): Promise<{ undo: Undo }> {
  let snapshot: { goal: Goal; moves: GoalMove[] } | null = null;
  await db.transaction('rw', db.goals, db.goalMoves, async () => {
    const goal = await db.goals.get(id);
    if (!goal) return;
    snapshot = { goal, moves: await db.goalMoves.where('goalId').equals(id).toArray() };
    await db.goalMoves.where('goalId').equals(id).delete();
    await db.goals.delete(id);
  });
  return {
    undo: async () => {
      if (!snapshot) return;
      const s = snapshot as { goal: Goal; moves: GoalMove[] };
      await db.transaction('rw', db.goals, db.goalMoves, async () => {
        await db.goals.put(s.goal);
        await db.goalMoves.bulkPut(s.moves);
      });
    },
  };
}
