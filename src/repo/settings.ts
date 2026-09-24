import { db } from '../data/db';
import type { Lang } from '../lib/money';
import type { WeekStart } from '../lib/period';

export interface Settings {
  lang: Lang | null;
  currency: string;
  weekStartsOn: WeekStart;
  theme: 'system' | 'light' | 'dark';
  fontSize: 'sm' | 'md' | 'lg';
  onboarded: boolean;
  firstRunAt: number;
  lastWalletId: string | null;
  lastBackupAt: number | null;
  backupBannerSnoozedAt: number | null;
  // Security
  pinHash: string | null;
  pinSalt: string | null;
  pinIterations: number;
  pinLength: number;
  lockTimeoutMin: number;
  bioCredentialId: string | null;
  bioPublicKey: string | null;
  bioAlg: number | null;
}

export const DEFAULT_SETTINGS: Settings = {
  lang: null,
  currency: 'MRU',
  weekStartsOn: 1,
  theme: 'system',
  fontSize: 'md',
  onboarded: false,
  firstRunAt: 0,
  lastWalletId: null,
  lastBackupAt: null,
  backupBannerSnoozedAt: null,
  pinHash: null,
  pinSalt: null,
  pinIterations: 210000,
  pinLength: 4,
  lockTimeoutMin: 5,
  bioCredentialId: null,
  bioPublicKey: null,
  bioAlg: null,
};

/** Keys that are device-specific and never travel inside a backup file. */
export const DEVICE_ONLY_KEYS: Array<keyof Settings> = [
  'pinHash', 'pinSalt', 'pinIterations', 'pinLength', 'bioCredentialId', 'bioPublicKey', 'bioAlg',
  'lastWalletId', 'backupBannerSnoozedAt',
];

export async function getSettings(): Promise<Settings> {
  const rows = await db.meta.toArray();
  const s: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) if (r.key in DEFAULT_SETTINGS) s[r.key] = r.value;
  return s as unknown as Settings;
}

export async function setSettings(patch: Partial<Settings>): Promise<void> {
  await db.meta.bulkPut(Object.entries(patch).map(([key, value]) => ({ key, value })));
}
