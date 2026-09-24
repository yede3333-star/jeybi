import { db } from '../data/db';
import type { Category, CategoryKind, ID } from '../data/types';
import { uid } from '../lib/id';

export async function listCategories(): Promise<Category[]> {
  const all = await db.categories.toArray();
  return all.sort((a, b) => a.order - b.order);
}

export async function createCategory(
  data: { kind: CategoryKind; parentId: ID | null; name: string; icon: string; color: string },
): Promise<Category> {
  const now = Date.now();
  const siblings = await db.categories.where('kind').equals(data.kind).count();
  const c: Category = { id: uid(), ...data, name: data.name.trim(), archived: false, order: siblings, createdAt: now, updatedAt: now };
  await db.categories.add(c);
  return c;
}

export async function updateCategory(id: ID, patch: Partial<Pick<Category, 'name' | 'icon' | 'color' | 'parentId' | 'archived' | 'order'>>, renamed = false) {
  const change: Partial<Category> = { ...patch, updatedAt: Date.now() };
  if (renamed) change.sysKey = undefined;
  await db.categories.update(id, change);
}

/** Deletes a category only if nothing uses it; otherwise archives it. Returns what happened. */
export async function removeCategory(id: ID): Promise<'deleted' | 'archived'> {
  return db.transaction('rw', [db.categories, db.transactions, db.templates, db.recurring, db.budgets], async () => {
    const children = await db.categories.where('parentId').equals(id).toArray();
    const ids = [id, ...children.map((c) => c.id)];
    let used = false;
    for (const cid of ids) {
      if (await db.transactions.where('categoryIds').equals(cid).count()) used = true;
      if (await db.templates.filter((t) => t.categoryId === cid).count()) used = true;
      if (await db.recurring.filter((r) => r.categoryId === cid).count()) used = true;
      if (await db.budgets.filter((b) => b.categoryId === cid).count()) used = true;
    }
    if (used) {
      for (const cid of ids) await db.categories.update(cid, { archived: true, updatedAt: Date.now() });
      return 'archived';
    }
    await db.categories.bulkDelete(ids);
    return 'deleted';
  });
}

export async function ensureFeesCategory(): Promise<Category> {
  const found = await db.categories.where('sysKey').equals('fees').first();
  if (found) return found;
  const now = Date.now();
  const c: Category = { id: uid(), kind: 'expense', parentId: null, name: '', sysKey: 'fees', icon: 'receipt',
    color: '#64748b', archived: false, order: 99, createdAt: now, updatedAt: now };
  await db.categories.add(c);
  return c;
}
