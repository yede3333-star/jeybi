// Android-app features that are pure logic: encrypted backups and the notification plan.
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../data/db';
import { initDatabase, wipeAll } from '../repo/init';
import { createTransaction } from '../repo/transactions';
import { BackupError, decryptBackup, exportBackup, exportEncryptedBackup, openBackupText, restoreBackup } from '../repo/backup';
import { deriveBackupKey } from '../services/backupCrypto';
import { getSettings, setSettings } from '../repo/settings';
import { planNotifications, NOTIFY_IDS, REMINDER_DAYS, type NotifyInput } from '../services/notifyPlan';
import { hawlEnd } from '../services/zakat';

// Fewer PBKDF2 rounds would hide nothing here, but 600k × many tests is slow: use a derived key.
const FAST = 1000;

beforeEach(async () => {
  await wipeAll();
  await initDatabase();
});

async function someData() {
  const wallet = (await db.wallets.toArray())[0];
  const cat = (await db.categories.toArray()).find((c) => c.kind === 'expense')!;
  await createTransaction({ type: 'expense', amount: 12_345, walletId: wallet.id, categoryId: cat.id, date: Date.now(), note: 'سرّي' });
}

describe('encrypted backup', () => {
  it('is unreadable without the password: no note, no amount, no wallet name in the file', async () => {
    await someData();
    const text = await exportEncryptedBackup(await deriveBackupKey('correct horse', undefined, FAST));
    expect(text).not.toContain('سرّي');
    expect(text).not.toContain('12345');
    expect(text).not.toContain('wallets');
    const opened = openBackupText(text);
    expect(opened.kind).toBe('encrypted');
  });

  it('round-trips with the right password and restores identical data', async () => {
    await someData();
    const before = await exportBackup();
    const text = await exportEncryptedBackup(await deriveBackupKey('correct horse', undefined, FAST));
    await wipeAll();
    await initDatabase();
    const opened = openBackupText(text);
    if (opened.kind !== 'encrypted') throw new Error('expected encrypted');
    const { file, preview } = await decryptBackup(opened.envelope, 'correct horse');
    expect(preview.transactions).toBe(1);
    await restoreBackup(file);
    const after = await exportBackup();
    expect(after.data.transactions).toEqual(before.data.transactions);
    expect(after.data.wallets).toEqual(before.data.wallets);
  });

  it('a wrong password gives a clear error and leaves the current data untouched', async () => {
    await someData();
    const text = await exportEncryptedBackup(await deriveBackupKey('right one', undefined, FAST));
    const snapshot = await exportBackup();
    const opened = openBackupText(text);
    if (opened.kind !== 'encrypted') throw new Error('expected encrypted');
    await expect(decryptBackup(opened.envelope, 'wrong one')).rejects.toEqual(new BackupError('wrongPassword'));
    const now = await exportBackup();
    expect(now.data.transactions).toEqual(snapshot.data.transactions);
  });

  it('a modified file is refused (authenticated encryption)', async () => {
    await someData();
    const env = JSON.parse(await exportEncryptedBackup(await deriveBackupKey('pw1234', undefined, FAST)));
    const bytes = atob(env.data);
    env.data = btoa(String.fromCharCode(bytes.charCodeAt(0) ^ 1) + bytes.slice(1));
    await expect(decryptBackup(env, 'pw1234')).rejects.toEqual(new BackupError('wrongPassword'));
  });

  it('the stored auto-backup key encrypts files that the password alone opens', async () => {
    await someData();
    const key = await deriveBackupKey('auto pass', undefined, FAST);
    await setSettings({ autoBackupKey: key });
    const stored = (await getSettings()).autoBackupKey!; // survives IndexedDB storage
    const opened = openBackupText(await exportEncryptedBackup(stored));
    if (opened.kind !== 'encrypted') throw new Error('expected encrypted');
    expect((await decryptBackup(opened.envelope, 'auto pass')).preview.transactions).toBe(1);
  });

  it('old unencrypted files still import, and the auto-backup key never travels in a backup', async () => {
    await someData();
    await setSettings({ autoBackupKey: await deriveBackupKey('x', undefined, FAST), lastAutoBackupAt: 5 });
    const plain = await exportBackup();
    expect(plain.data.settings).not.toHaveProperty('autoBackupKey');
    expect(plain.data.settings).not.toHaveProperty('lastAutoBackupAt');
    const opened = openBackupText(JSON.stringify(plain));
    expect(opened.kind).toBe('plain');
    if (opened.kind === 'plain') expect(opened.preview.transactions).toBe(1);
  });
});

describe('notification plan', () => {
  const t = (k: string, v?: Record<string, unknown>) => (v?.person ? `${k}:${v.person}` : k);
  // 2026-10-05 10:00 local time
  const now = +new Date(2026, 9, 5, 10, 0);
  const base: NotifyInput = {
    now, notificationsEnabled: true, reminderEnabled: true, reminderHour: 20, recordedToday: false, debts: [], hawlStart: null, t,
  };

  it('nothing at all when phone notifications are off', () => {
    expect(planNotifications({ ...base, notificationsEnabled: false, debts: [{ id: 'd', person: 'A', direction: 'i_owe', dueDate: now + 86_400_000 * 3, closedAt: null }] })).toEqual([]);
  });

  it('a daily reminder at the chosen hour, today included when nothing was recorded', () => {
    const p = planNotifications(base);
    expect(p).toHaveLength(REMINDER_DAYS);
    expect(new Date(p[0].at)).toEqual(new Date(2026, 9, 5, 20, 0));
    expect(new Date(p[1].at)).toEqual(new Date(2026, 9, 6, 20, 0));
    expect(new Set(p.map((n) => n.id)).size).toBe(p.length);
  });

  it("skips today's reminder once something is recorded, and past hours", () => {
    expect(new Date(planNotifications({ ...base, recordedToday: true })[0].at)).toEqual(new Date(2026, 9, 6, 20, 0));
    expect(new Date(planNotifications({ ...base, reminderHour: 8 })[0].at)).toEqual(new Date(2026, 9, 6, 8, 0));
  });

  it('debts: only open ones with a future due date, at 09:00 on that day', () => {
    const p = planNotifications({
      ...base, reminderEnabled: false,
      debts: [
        { id: 'a', person: 'Ali', direction: 'owed_to_me', dueDate: +new Date(2026, 9, 10), closedAt: null },
        { id: 'b', person: 'Sidi', direction: 'i_owe', dueDate: +new Date(2026, 9, 8), closedAt: null },
        { id: 'c', person: 'Closed', direction: 'i_owe', dueDate: +new Date(2026, 9, 9), closedAt: now },
        { id: 'd', person: 'Past', direction: 'i_owe', dueDate: +new Date(2026, 9, 1), closedAt: null },
        { id: 'e', person: 'NoDate', direction: 'i_owe', dueDate: null, closedAt: null },
      ],
    });
    expect(p.map((n) => n.body)).toEqual(['notify.debtIOwe:Sidi', 'notify.debtOwedToMe:Ali']);
    expect(new Date(p[0].at)).toEqual(new Date(2026, 9, 8, 9, 0));
    expect(p.every((n) => n.id >= NOTIFY_IDS.debtBase)).toBe(true);
  });

  it('the end of the hawl, only while it is ahead', () => {
    const start = +new Date(2026, 0, 1);
    const p = planNotifications({ ...base, reminderEnabled: false, hawlStart: start });
    expect(p).toHaveLength(1);
    expect(p[0].at).toBe(+new Date(hawlEnd(start)) + 9 * 3_600_000);
    expect(planNotifications({ ...base, reminderEnabled: false, hawlStart: +new Date(2025, 0, 1) })).toEqual([]);
  });
});
