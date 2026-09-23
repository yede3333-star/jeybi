import Dexie, { type Table } from 'dexie';
import type { AuditEntry, Category, MetaRow, Receipt, Template, Transaction, Wallet } from './types';

export class JeybiDB extends Dexie {
  wallets!: Table<Wallet, string>;
  categories!: Table<Category, string>;
  transactions!: Table<Transaction, string>;
  templates!: Table<Template, string>;
  receipts!: Table<Receipt, string>;
  audit!: Table<AuditEntry, number>;
  meta!: Table<MetaRow, string>;

  constructor(name = 'jeybi') {
    super(name);
    // Bump the version and add an .upgrade() here for phase-2 schema changes
    // (budgets, goals, debts, recurring…) — never edit version 1 in place.
    this.version(1).stores({
      wallets: 'id, order',
      categories: 'id, kind, parentId, sysKey',
      transactions: 'id, date, type, walletId, toWalletId, *categoryIds, *tags, transferId',
      templates: 'id, order',
      receipts: 'id',
      audit: '++seq, txId, at',
      meta: 'key',
    });
  }
}

export const db = new JeybiDB();
