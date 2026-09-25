// Data the Android-only background features need: the notification plan inputs and the weekly
// encrypted backup. The native side effects themselves are in platform/native.ts.
import { format, startOfDay } from 'date-fns';
import { db } from '../data/db';
import { getSettings, setSettings } from './settings';
import { exportEncryptedBackup } from './backup';
import type { NotifyInput } from '../services/notifyPlan';

export const AUTO_BACKUP_EVERY_MS = 7 * 86_400_000;

/** Everything planNotifications() needs from the database. */
export async function notificationInputs(now = Date.now()): Promise<Omit<NotifyInput, 'now' | 't'>> {
  const s = await getSettings();
  const dayStart = +startOfDay(now);
  const [debts, today] = await Promise.all([
    db.debts.toArray(),
    db.transactions.where('date').between(dayStart, dayStart + 86_400_000, true, false).filter((t) => t.deletedAt == null).count(),
  ]);
  return {
    notificationsEnabled: s.notificationsEnabled,
    reminderEnabled: s.reminderEnabled,
    reminderHour: s.reminderHour,
    recordedToday: today > 0,
    debts: debts.filter((d) => !d.demo).map((d) => ({ id: d.id, person: d.person, direction: d.direction, dueDate: d.dueDate, closedAt: d.closedAt })),
    hawlStart: s.zakat.hawlStart,
  };
}

/** True when the weekly backup is set up and due. */
export async function autoBackupDue(now = Date.now()): Promise<boolean> {
  const s = await getSettings();
  return !!s.autoBackupKey && (s.lastAutoBackupAt == null || now - s.lastAutoBackupAt >= AUTO_BACKUP_EVERY_MS);
}

/**
 * The encrypted file for the weekly backup, with the stored key (the password itself is never
 * stored). `save` writes it (Documents/Jeybi on Android).
 */
export async function makeAutoBackup<T>(save: (text: string, stamp: string) => Promise<T>, now = Date.now()): Promise<T> {
  const s = await getSettings();
  if (!s.autoBackupKey) throw new Error('auto backup not set up');
  const saved = await save(await exportEncryptedBackup(s.autoBackupKey), format(now, 'yyyy-MM-dd-HHmm'));
  await setSettings({ lastAutoBackupAt: now });
  return saved;
}
