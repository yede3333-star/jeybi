// Recurring income/expenses. There is no server, so due occurrences are generated when the app
// opens (after the home screen is shown). Each rule keeps a counter of generated occurrences that
// is advanced in the same database transaction as the generation, and every occurrence has a
// deterministic key — opening the app many times (or in two tabs) never creates duplicates.
import { addDays, addMonths, addWeeks, addYears, format, startOfDay } from 'date-fns';
import { db } from '../data/db';
import type { Frequency, ID, PendingOccurrence, Recurring } from '../data/types';
import { uid } from '../lib/id';
import { createTransaction } from './transactions';

/** Date of occurrence n (0-based), always computed from the start date. */
export function occurrenceDate(start: number, frequency: Frequency, n: number): number {
  const s = new Date(start);
  switch (frequency) {
    case 'daily': return +addDays(s, n);
    case 'weekly': return +addWeeks(s, n);
    case 'monthly': return +addMonths(s, n); // clamps 31 → 28/29/30 for that month only
    case 'yearly': return +addYears(s, n); // 29 Feb → 28 Feb in non-leap years
  }
}

export const occurrenceKey = (ruleId: ID, date: number) => `${ruleId}:${format(date, 'yyyy-MM-dd')}`;

/** Occurrences due at `now` that have not been generated yet (capped as a safety net). */
export function dueOccurrences(rule: Recurring, now: number, max = 400): Array<{ n: number; date: number }> {
  const out: Array<{ n: number; date: number }> = [];
  for (let n = rule.generated; out.length < max; n++) {
    const date = occurrenceDate(rule.startDate, rule.frequency, n);
    if (date > now || (rule.endDate != null && date > rule.endDate)) break;
    out.push({ n, date });
  }
  return out;
}

/** Number of occurrences before `from` (they are skipped when a rule is created or rescheduled). */
function occurrencesBefore(start: number, frequency: Frequency, from: number): number {
  let n = 0;
  while (occurrenceDate(start, frequency, n) < from && n < 100_000) n++;
  return n;
}

export type RecurringInput = Omit<Recurring, 'id' | 'generated' | 'nextDue' | 'createdAt'>;

/** Creates or updates a rule. Past occurrences (before today) are never back-filled. */
export async function saveRecurring(input: RecurringInput, id?: ID): Promise<Recurring> {
  const now = Date.now();
  return db.transaction('rw', db.recurring, async () => {
    const existing = id ? await db.recurring.get(id) : undefined;
    const sameSchedule = existing && existing.startDate === input.startDate && existing.frequency === input.frequency;
    const generated = sameSchedule ? existing.generated : occurrencesBefore(input.startDate, input.frequency, +startOfDay(now));
    const rule: Recurring = {
      ...input,
      id: existing?.id ?? uid(),
      generated,
      nextDue: occurrenceDate(input.startDate, input.frequency, generated),
      createdAt: existing?.createdAt ?? now,
    };
    await db.recurring.put(rule);
    return rule;
  });
}

export async function listRecurring(): Promise<Recurring[]> {
  return (await db.recurring.toArray()).sort((a, b) => Number(b.active) - Number(a.active) || a.nextDue - b.nextDue);
}

export async function removeRecurring(id: ID): Promise<void> {
  await db.transaction('rw', db.recurring, db.pending, async () => {
    await db.recurring.delete(id);
    await db.pending.where('recurringId').equals(id).delete();
  });
}

export async function setRecurringActive(id: ID, active: boolean): Promise<void> {
  const rule = await db.recurring.get(id);
  if (!rule) return;
  if (active && !rule.active) {
    // Resuming: skip what was missed while paused.
    const generated = Math.max(rule.generated, occurrencesBefore(rule.startDate, rule.frequency, +startOfDay(Date.now())));
    await db.recurring.update(id, { active, generated, nextDue: occurrenceDate(rule.startDate, rule.frequency, generated) });
  } else await db.recurring.update(id, { active });
}

async function recordOccurrence(rule: Recurring, date: number, key: string) {
  // Deterministic key: if it already exists (even in the trash), don't create it again.
  if (await db.transactions.where('recurringKey').equals(key).count()) return false;
  await createTransaction({
    type: rule.type, amount: rule.amount, walletId: rule.walletId, categoryId: rule.categoryId, date,
    note: rule.note || rule.name, tags: rule.tags, recurringKey: key, demo: rule.demo,
  });
  return true;
}

/** Generates everything due. Safe to call on every open. Returns what was added. */
export async function runRecurring(now = Date.now()): Promise<{ created: number; pending: number }> {
  let created = 0, pending = 0;
  await db.transaction('rw', [db.recurring, db.pending, db.transactions, db.audit, db.meta, db.categories, db.receipts, db.debts], async () => {
    const rules = await db.recurring.where('nextDue').belowOrEqual(now).toArray();
    for (const rule of rules) {
      if (!rule.active) continue;
      const due = dueOccurrences(rule, now);
      if (!due.length) continue;
      for (const { date } of due) {
        const key = occurrenceKey(rule.id, date);
        if (rule.mode === 'auto') {
          if (await recordOccurrence(rule, date, key)) created++;
        } else if (!(await db.pending.get(key)) && !(await db.transactions.where('recurringKey').equals(key).count())) {
          await db.pending.put({ id: key, recurringId: rule.id, date });
          pending++;
        }
      }
      const generated = due[due.length - 1].n + 1;
      await db.recurring.update(rule.id, { generated, nextDue: occurrenceDate(rule.startDate, rule.frequency, generated) });
    }
  });
  return { created, pending };
}

export async function listPending(): Promise<Array<PendingOccurrence & { rule?: Recurring }>> {
  const rows = await db.pending.orderBy('date').toArray();
  const rules = new Map((await db.recurring.toArray()).map((r) => [r.id, r]));
  return rows.map((p) => ({ ...p, rule: rules.get(p.recurringId) }));
}

export async function confirmPending(id: string): Promise<void> {
  await db.transaction('rw', [db.recurring, db.pending, db.transactions, db.audit, db.meta, db.categories, db.receipts, db.debts], async () => {
    const p = await db.pending.get(id);
    if (!p) return;
    const rule = await db.recurring.get(p.recurringId);
    if (rule) await recordOccurrence(rule, p.date, p.id);
    await db.pending.delete(id);
  });
}

export async function dismissPending(id: string): Promise<void> {
  await db.pending.delete(id);
}
