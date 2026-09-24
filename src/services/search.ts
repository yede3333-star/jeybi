// Text/amount search over transactions. Pure functions (tested in src/tests/search.test.ts).
//
// Why a separate index: the words a user sees are mostly NOT stored in the transaction. A quick
// entry has an empty note; its category shows as "بقالة" but is stored as { name: '', sysKey:
// 'groceries' } and translated at display time. So we search the *displayed* names of the
// categories (and parents), wallets and templates, in both languages, plus the note and tags.
import type { Category, Debt, ID, Template, Transaction, Wallet } from '../data/types';
import { parseAmount } from '../lib/money';

const TATWEEL = new RegExp(String.fromCharCode(0x0640), 'g');
const EASTERN_DIGIT = /[٠-٩۰-۹]/g;

/**
 * Normalises text for matching: lower case, no accents (é→e), no Arabic diacritics or tatweel,
 * أ إ آ ٱ → ا, ة → ه, ى → ي, ؤ → و, ئ → ي, Eastern Arabic digits → 0-9, "_" and "#" → space.
 */
export function normalize(s: string): string {
  return s
    .normalize('NFD') // splits é → e + ́, and أ → ا + hamza, آ → ا + madda, ؤ → و + hamza, ئ → ي + hamza
    .replace(/\p{M}/gu, '') // drops those marks and all Arabic tashkeel
    .replace(TATWEEL, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[ىئ]/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(EASTERN_DIGIT, (d) => String(d.charCodeAt(0) >= 0x06f0 ? d.charCodeAt(0) - 0x06f0 : d.charCodeAt(0) - 0x0660))
    .toLowerCase()
    .replace(/[_#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface SearchQuery {
  /** Normalised words; every word must match somewhere (AND). */
  tokens: string[];
  /** Set when the whole query reads as an amount ("5000", "5 000", "5,000", "5.000", "٥٠٠٠"). */
  amount: number | null;
}

export function parseQuery(raw: string): SearchQuery | null {
  const q = normalize(raw);
  if (!q) return null;
  const amount = /^[\d\s.,]+$/.test(q) ? parseAmount(q) : null;
  return { tokens: q.split(' '), amount: amount && amount > 0 ? amount : null };
}

/** Normalised display names, precomputed once per search. */
export interface SearchNames {
  category: Map<ID, string>;
  wallet: Map<ID, string>;
  template: Map<ID, string>;
  /** Person of each debt (debt movements are found by the person's name). */
  debt: Map<ID, string>;
}

/**
 * @param labels  display names of a built-in entity in every UI language (for sysKey items)
 */
export function buildSearchNames(
  categories: Category[], wallets: Wallet[], templates: Template[], labels: (sysKey: string) => string[], debts: Debt[] = [],
): SearchNames {
  const names = (e: Category | Wallet) => [e.name, ...(e.sysKey ? labels(e.sysKey) : [])].filter(Boolean).join(' ');
  const byId = new Map(categories.map((c) => [c.id, c]));
  const category = new Map<ID, string>();
  for (const c of categories) {
    const parent = c.parentId ? byId.get(c.parentId) : undefined;
    category.set(c.id, normalize(`${names(c)} ${parent ? names(parent) : ''}`));
  }
  return {
    category,
    wallet: new Map(wallets.map((w) => [w.id, normalize(names(w))])),
    template: new Map(templates.map((t) => [t.id, normalize(t.name)])),
    debt: new Map(debts.map((d) => [d.id, normalize(`${d.person} ${d.note}`)])),
  };
}

function haystack(t: Transaction, names?: SearchNames): string {
  const parts = [normalize(t.note), normalize(t.tags.join(' '))];
  if (names) {
    for (const s of t.splits) parts.push(names.category.get(s.categoryId) ?? '');
    parts.push(names.wallet.get(t.walletId) ?? '');
    if (t.toWalletId) parts.push(names.wallet.get(t.toWalletId) ?? '');
    if (t.templateId) parts.push(names.template.get(t.templateId) ?? '');
    if (t.debtId) parts.push(names.debt.get(t.debtId) ?? '');
  }
  return parts.join(' ');
}

/**
 * Returns null when the transaction doesn't match, otherwise the amount that counts for the
 * match: the whole amount, or — when only a split part has the searched amount — that part.
 */
export function matchQuery(t: Transaction, q: SearchQuery, names?: SearchNames): number | null {
  if (q.amount != null) {
    if (t.amount === q.amount || t.origAmount === q.amount) return t.amount; // base or original currency amount
    const part = t.splits.find((s) => s.amount === q.amount);
    if (part) return part.amount;
  }
  const hay = haystack(t, names);
  return q.tokens.every((tok) => hay.includes(tok)) ? t.amount : null;
}

/** Text-only match for other entities (debts by person, savings goals by name). */
export function matchText(q: SearchQuery, text: string, amounts: number[] = []): boolean {
  if (q.amount != null && amounts.includes(q.amount)) return true;
  const hay = normalize(text);
  return q.tokens.every((tok) => hay.includes(tok));
}
