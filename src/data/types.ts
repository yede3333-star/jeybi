export type ID = string;
/** `debt` = money lent/borrowed/repaid: moves a wallet but is never income or expense. */
export type TxType = 'income' | 'expense' | 'transfer' | 'debt';
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
  /** Last balance reconciliation (phase 2). */
  lastReconciledAt?: number;
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
  /** Debt movements: the debt, and whether money came into (in) or left (out) the wallet. */
  debtId?: ID;
  flow?: 'in' | 'out';
  /** Occurrence key "recurringId:yyyy-MM-dd" for transactions generated from a recurring rule. */
  recurringKey?: string;
  /** Foreign-currency entry: original amount (minor units of `origCurrency`) and the rate used,
   *  as base-currency per 1 unit × 10 000 (integer, so no float rounding). `amount` is in base. */
  origCurrency?: string;
  origAmount?: number;
  rateE4?: number;
  /** Balance reconciliation adjustment. */
  adjustment?: boolean;
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

// ---------------- Phase 2 ----------------

export type DebtDirection = 'owed_to_me' | 'i_owe';

export interface Debt {
  id: ID;
  direction: DebtDirection;
  person: string;
  /** Principal in base minor units. */
  amount: number;
  date: number;
  dueDate: number | null;
  note: string;
  /** Wallet the principal left/entered. null = recorded without moving money (an older debt). */
  walletId: ID | null;
  /** Transaction that moved the principal (when walletId is set). */
  principalTxId: ID | null;
  closedAt: number | null;
  demo?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Budget {
  /** "yyyy-MM:categoryId" */
  id: string;
  month: string;
  categoryId: ID;
  amount: number;
  demo?: boolean;
}

export type Frequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface Recurring {
  id: ID;
  name: string;
  type: 'income' | 'expense';
  amount: number;
  walletId: ID;
  categoryId: ID;
  note: string;
  tags: string[];
  frequency: Frequency;
  /** First occurrence (its time of day is used for every occurrence). */
  startDate: number;
  endDate: number | null;
  /** auto = recorded directly; confirm = waits in "pending" until the user accepts. */
  mode: 'auto' | 'confirm';
  /** Occurrences already generated (or queued for confirmation). Occurrence n is computed from
   *  startDate + n periods, so "monthly on the 31st" gives 31 Jan, 28 Feb, 31 Mar… */
  generated: number;
  /** Date of occurrence `generated` (next one due) — indexed, advanced atomically with `generated`. */
  nextDue: number;
  active: boolean;
  demo?: boolean;
  createdAt: number;
}

export interface PendingOccurrence {
  /** "recurringId:yyyy-MM-dd" */
  id: string;
  recurringId: ID;
  date: number;
}

export interface Goal {
  id: ID;
  name: string;
  target: number;
  targetDate: number | null;
  icon: string;
  color: string;
  imageId?: ID;
  archived: boolean;
  demo?: boolean;
  createdAt: number;
}

/** Money set aside for a goal (+) or taken back (−). It stays in its wallet. */
export interface GoalMove {
  id: ID;
  goalId: ID;
  walletId: ID;
  amount: number;
  date: number;
  note: string;
  demo?: boolean;
}
