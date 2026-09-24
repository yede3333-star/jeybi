export type ID = string;
export type TxType = 'income' | 'expense' | 'transfer';
export type CategoryKind = 'income' | 'expense';

/** All money values are integers in minor units (amount × 100). */
export interface Wallet {
  id: ID;
  name: string;
  /** Set for built-in wallets: the display name then comes from translations. Cleared on rename. */
  sysKey?: string;
  color: string;
  icon: string;
  openingBalance: number;
  archived: boolean;
  order: number;
  createdAt: number;
  updatedAt: number;
}

export interface Category {
  id: ID;
  kind: CategoryKind;
  parentId: ID | null;
  name: string;
  sysKey?: string;
  color: string;
  icon: string;
  archived: boolean;
  order: number;
  createdAt: number;
  updatedAt: number;
}

export interface Split {
  categoryId: ID;
  amount: number;
}

export interface Transaction {
  id: ID;
  type: TxType;
  amount: number;
  /** Source wallet for expense/transfer, destination wallet for income. */
  walletId: ID;
  /** Destination wallet for transfers. */
  toWalletId?: ID;
  /** Income/expense always have ≥1 split; a plain transaction has exactly one. Empty for transfers. */
  splits: Split[];
  /** Denormalised from splits for indexing. */
  categoryIds: ID[];
  date: number;
  note: string;
  tags: string[];
  receiptId?: ID;
  /** On a fee expense: the transfer it belongs to. */
  transferId?: ID;
  /** On a transfer: its linked fee expense. */
  feeTxId?: ID;
  /** Set when created from a quick template (lets search find it by the template name). */
  templateId?: ID;
  currency: string;
  demo?: boolean;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export interface Template {
  id: ID;
  name: string;
  type: CategoryKind;
  amount: number;
  categoryId: ID;
  walletId?: ID;
  note: string;
  tags: string[];
  order: number;
  createdAt: number;
}

export interface Receipt {
  id: ID;
  blob: Blob;
  mime: string;
  createdAt: number;
}

export interface FieldChange {
  field: string;
  old: unknown;
  new: unknown;
}

export interface AuditEntry {
  seq?: number;
  txId: ID;
  at: number;
  action: 'create' | 'update' | 'delete' | 'restore';
  changes?: FieldChange[];
}

export interface MetaRow {
  key: string;
  value: unknown;
}
