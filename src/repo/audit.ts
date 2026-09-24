import { db } from '../data/db';
import type { AuditEntry, FieldChange, ID, Transaction } from '../data/types';

const TRACKED: Array<keyof Transaction> = [
  'type', 'amount', 'walletId', 'toWalletId', 'splits', 'date', 'note', 'tags', 'receiptId', 'origCurrency', 'origAmount', 'rateE4',
];

export function diffTx(before: Transaction, after: Transaction): FieldChange[] {
  const out: FieldChange[] = [];
  for (const f of TRACKED) {
    const a = before[f] ?? null, b = after[f] ?? null;
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push({ field: f, old: a, new: b });
  }
  return out;
}

export async function log(txId: ID, action: AuditEntry['action'], changes?: FieldChange[], at = Date.now()) {
  await db.audit.add({ txId, at, action, ...(changes ? { changes } : {}) });
}

export async function historyOf(txId: ID): Promise<AuditEntry[]> {
  return db.audit.where('txId').equals(txId).sortBy('seq');
}
