import { db } from '../data/db';
import type { ID, Wallet } from '../data/types';
import { uid } from '../lib/id';

export async function listWallets(): Promise<Wallet[]> {
  const all = await db.wallets.toArray();
  return all.sort((a, b) => a.order - b.order);
}

export async function createWallet(data: { name: string; icon: string; color: string; openingBalance: number }): Promise<Wallet> {
  const now = Date.now();
  const w: Wallet = { id: uid(), ...data, name: data.name.trim(), archived: false, order: await db.wallets.count(), createdAt: now, updatedAt: now };
  await db.wallets.add(w);
  return w;
}

export async function updateWallet(id: ID, patch: Partial<Pick<Wallet, 'name' | 'icon' | 'color' | 'openingBalance' | 'archived' | 'order'>>, renamed = false) {
  const change: Partial<Wallet> = { ...patch, updatedAt: Date.now() };
  if (renamed) change.sysKey = undefined;
  await db.wallets.update(id, change);
}

export async function setOpeningBalances(values: Record<ID, number>) {
  await db.transaction('rw', db.wallets, async () => {
    for (const [id, v] of Object.entries(values)) await db.wallets.update(id, { openingBalance: v, updatedAt: Date.now() });
  });
}

/** Deletes the wallet only if unused; otherwise archives it. */
export async function removeWallet(id: ID): Promise<'deleted' | 'archived'> {
  return db.transaction('rw', [db.wallets, db.transactions, db.recurring, db.goalMoves, db.debts, db.templates], async () => {
    // Anything that points at the wallet keeps it (archived) so nothing is left dangling.
    const used = (await db.transactions.where('walletId').equals(id).count()) + (await db.transactions.where('toWalletId').equals(id).count())
      + (await db.recurring.filter((r) => r.walletId === id).count()) + (await db.goalMoves.where('walletId').equals(id).count())
      + (await db.debts.filter((d) => d.walletId === id).count()) + (await db.templates.filter((t) => t.walletId === id).count());
    if (used) {
      await db.wallets.update(id, { archived: true, updatedAt: Date.now() });
      return 'archived';
    }
    await db.wallets.delete(id);
    return 'deleted';
  });
}
