import { db } from '../data/db';
import type { ID, Template, Transaction } from '../data/types';
import { uid } from '../lib/id';
import { createTransaction } from './transactions';
import { getSettings } from './settings';

export async function listTemplates(): Promise<Template[]> {
  const all = await db.templates.toArray();
  return all.sort((a, b) => a.order - b.order);
}

export async function saveTemplate(data: Omit<Template, 'id' | 'order' | 'createdAt'> & { id?: ID }): Promise<Template> {
  const existing = data.id ? await db.templates.get(data.id) : undefined;
  const t: Template = {
    ...data,
    id: existing?.id ?? uid(),
    name: data.name.trim(),
    order: existing?.order ?? (await db.templates.count()),
    createdAt: existing?.createdAt ?? Date.now(),
  };
  await db.templates.put(t);
  return t;
}

export async function removeTemplate(id: ID) {
  await db.templates.delete(id);
}

export async function reorderTemplates(ids: ID[]) {
  await db.transaction('rw', db.templates, async () => {
    for (const [i, id] of ids.entries()) await db.templates.update(id, { order: i });
  });
}

/** A template from an existing (non-split, non-transfer) transaction. */
export function templateFromTx(tx: Transaction, name: string): Omit<Template, 'id' | 'order' | 'createdAt'> | null {
  if (tx.type === 'transfer' || !tx.splits.length) return null;
  const main = [...tx.splits].sort((a, b) => b.amount - a.amount)[0];
  return { name, type: tx.type, amount: tx.amount, categoryId: main.categoryId, walletId: tx.walletId, note: tx.note, tags: tx.tags };
}

/** One-tap: records the template as a new transaction now. */
export async function applyTemplate(t: Template) {
  const s = await getSettings();
  const wallets = await db.wallets.toArray();
  const usable = (id?: string | null) => !!id && wallets.some((w) => w.id === id && !w.archived);
  const walletId = usable(t.walletId) ? t.walletId! : usable(s.lastWalletId) ? s.lastWalletId! : wallets.find((w) => !w.archived)?.id;
  if (!walletId) throw new Error('noWallet');
  return createTransaction({
    type: t.type, amount: t.amount, walletId, categoryId: t.categoryId, date: Date.now(), note: t.note, tags: t.tags,
  });
}
