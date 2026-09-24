import { db } from '../data/db';
import { buildDefaultCategories, buildDefaultWallets } from '../data/defaults';
import { getSettings, setSettings } from './settings';
import { ensureFlows, FLOWS_KEY } from './flows';

/**
 * Runs on every open, so the common path is two cheap key reads. Seeding defaults and building
 * the balance cache happen only once (first run, or first open after an upgrade/import).
 */
export async function initDatabase(): Promise<void> {
  const [seeded, flows] = await Promise.all([db.meta.get('seeded'), db.meta.get(FLOWS_KEY)]);
  if (seeded && flows) return;
  if (!seeded) {
    await db.transaction('rw', db.wallets, db.categories, db.meta, async () => {
      if (await db.meta.get('seeded')) return;
      if ((await db.wallets.count()) === 0) await db.wallets.bulkAdd(buildDefaultWallets());
      if ((await db.categories.count()) === 0) await db.categories.bulkAdd(buildDefaultCategories());
      await db.meta.put({ key: 'seeded', value: true });
      const s = await getSettings();
      if (!s.firstRunAt) await setSettings({ firstRunAt: Date.now() });
    });
  }
  await ensureFlows();
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
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });
}
