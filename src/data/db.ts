import Dexie, { type Table } from 'dexie';
import type {
  AuditEntry, Budget, Category, Debt, Goal, GoalMove, MetaRow, PendingOccurrence, Receipt, Recurring, Template,
  Transaction, Wallet,
} from './types';
import { missingSystemCategories } from './defaults';

/** Phase-1 schema. Never edit: existing phones have databases at this version. */
export const SCHEMA_V1 = {
  wallets: 'id, order',
  categories: 'id, kind, parentId, sysKey',
  transactions: 'id, date, type, walletId, toWalletId, *categoryIds, *tags, transferId',
  templates: 'id, order',
  receipts: 'id',
  audit: '++seq, txId, at',
  meta: 'key',
};

/** Phase 2: new tables + indexes only. Existing rows are kept as they are. */
export const SCHEMA_V2 = {
  ...SCHEMA_V1,
  transactions: 'id, date, type, walletId, toWalletId, *categoryIds, *tags, transferId, debtId, recurringKey',
  debts: 'id, person, dueDate, closedAt',
  budgets: 'id, month',
  recurring: 'id, nextDue',
  pending: 'id, recurringId, date',
  goals: 'id',
  goalMoves: 'id, goalId, walletId',
};

export class JeybiDB extends Dexie {
  wallets!: Table<Wallet, string>;
  categories!: Table<Category, string>;
  transactions!: Table<Transaction, string>;
  templates!: Table<Template, string>;
  receipts!: Table<Receipt, string>;
  audit!: Table<AuditEntry, number>;
  meta!: Table<MetaRow, string>;
  debts!: Table<Debt, string>;
  budgets!: Table<Budget, string>;
  recurring!: Table<Recurring, string>;
  pending!: Table<PendingOccurrence, string>;
  goals!: Table<Goal, string>;
  goalMoves!: Table<GoalMove, string>;

  constructor(name = 'jeybi') {
    super(name);
    this.version(1).stores(SCHEMA_V1);
    // v1 → v2: adds tables/indexes (Dexie builds the new indexes from existing rows) and the new
    // built-in categories (zakat, balance adjustments). Nothing existing is modified or removed.
    this.version(2).stores(SCHEMA_V2).upgrade(async (tx) => {
      const categories = tx.table<Category, string>('categories');
      const missing = missingSystemCategories(await categories.toArray());
      if (missing.length) await categories.bulkAdd(missing);
    });
    // Future versions: add this.version(3)… here. Never edit versions 1 and 2.
  }
}

export const db = new JeybiDB();
