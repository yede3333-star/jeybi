import { db } from '../data/db';
import type { ID } from '../data/types';
import { uid } from '../lib/id';

export async function saveReceipt(blob: Blob): Promise<ID> {
  const id = uid();
  await db.receipts.add({ id, blob, mime: blob.type || 'image/jpeg', createdAt: Date.now() });
  return id;
}

export async function getReceipt(id: ID) {
  return db.receipts.get(id);
}

export async function deleteReceipt(id: ID) {
  await db.receipts.delete(id);
}
