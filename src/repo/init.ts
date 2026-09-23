import { db } from '../data/db';
import { buildDefaultCategories, buildDefaultWallets } from '../data/defaults';
import { getSettings, setSettings } from './settings';

/** Seeds default wallets and categories on the very first run. Idempotent. */
export async function initDatabase(): Promise<void> {
  await db.transaction('rw', db.wallets, db.categories, db.meta, async () => {
    const seeded = await db.meta.get('seeded');
    if (seeded) return;
    if ((await db.wallets.count()) === 0) await db.wallets.bulkAdd(buildDefaultWallets());
    if ((await db.categories.count()) === 0) await db.categories.bulkAdd(buildDefaultCategories());
    await db.meta.put({ key: 'seeded', value: true });
    const s = await getSettings();
    if (!s.firstRunAt) await setSettings({ firstRunAt: Date.now() });
  });
}

/** Asks the browser not to evict our IndexedDB data under storage pressure. */
export async function requestPersistentStorage(): Promise<boolean | null> {
  try {
    if (!navigator.storage?.persist) return null;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}

/** Wipes everything (used by "reset app"). */
export async function wipeAll(): Promise<void> {
  await db.transaction('rw', [db.wallets, db.categories, db.transactions, db.templates, db.receipts, db.audit, db.meta], async () => {
    await Promise.all([db.wallets.clear(), db.categories.clear(), db.transactions.clear(), db.templates.clear(),
      db.receipts.clear(), db.audit.clear(), db.meta.clear()]);
  });
}
