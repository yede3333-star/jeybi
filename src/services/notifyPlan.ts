// Which phone notifications should be scheduled right now (Android app). Pure: the native layer
// cancels everything pending and schedules this list again whenever an input changes.
import { addDays, setHours, startOfDay } from 'date-fns';
import { hawlEnd } from './zakat';
import type { DebtDirection } from '../data/types';

export interface PlannedNotification {
  id: number;
  title: string;
  body: string;
  at: number;
}

export interface NotifyInput {
  now: number;
  notificationsEnabled: boolean;
  reminderEnabled: boolean;
  reminderHour: number;
  /** Something was already recorded today: today's reminder is not needed. */
  recordedToday: boolean;
  debts: Array<{ id: string; person: string; direction: DebtDirection; dueDate: number | null; closedAt: number | null }>;
  hawlStart: number | null;
  t: (key: string, vars?: Record<string, unknown>) => string;
}

/** Individual daily reminders instead of one repeating alarm, so today's can be skipped. Re-planned at every open. */
export const REMINDER_DAYS = 30;
const DUE_HOUR = 9;
export const NOTIFY_IDS = { reminder: 100, zakat: 50, autoBackup: 60, debtBase: 1_000_000 } as const;

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return Math.abs(h) % 1_000_000;
}

export function planNotifications(i: NotifyInput): PlannedNotification[] {
  if (!i.notificationsEnabled) return [];
  const out: PlannedNotification[] = [];
  const title = i.t('app.name');
  if (i.reminderEnabled) {
    for (let d = 0; d < REMINDER_DAYS; d++) {
      const at = +setHours(startOfDay(addDays(i.now, d)), i.reminderHour);
      if (at <= i.now || (d === 0 && i.recordedToday)) continue;
      out.push({ id: NOTIFY_IDS.reminder + d, title, body: i.t('notify.daily'), at });
    }
  }
  const due = i.debts
    .filter((d) => d.closedAt == null && d.dueDate != null)
    .map((d) => ({ d, at: +setHours(startOfDay(d.dueDate!), DUE_HOUR) }))
    .filter((x) => x.at > i.now)
    .sort((a, b) => a.at - b.at)
    .slice(0, 50);
  for (const { d, at } of due) {
    out.push({
      id: NOTIFY_IDS.debtBase + hash(d.id),
      title,
      body: i.t(d.direction === 'owed_to_me' ? 'notify.debtOwedToMe' : 'notify.debtIOwe', { person: d.person }),
      at,
    });
  }
  if (i.hawlStart != null) {
    const at = +setHours(startOfDay(hawlEnd(i.hawlStart)), DUE_HOUR);
    if (at > i.now) out.push({ id: NOTIFY_IDS.zakat, title, body: i.t('notify.hawl'), at });
  }
  return out;
}
