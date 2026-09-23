import { describe, expect, it } from 'vitest';
import { db } from '../data/db';
import { initDatabase, wipeAll } from '../repo/init';
import { addDemoData } from '../repo/demo';
import { walletBalances } from '../services/reports';

describe('demo data', () => {
  it('stays realistic: no wallet ends up negative on a fresh install', async () => {
    await wipeAll();
    await initDatabase();
    await addDemoData('ar', new Date(2026, 8, 23).getTime());
    const b = walletBalances(await db.wallets.toArray(), await db.transactions.toArray());
    for (const v of b.values()) expect(v).toBeGreaterThanOrEqual(0);
  });
});
