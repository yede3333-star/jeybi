import type { Category, CategoryKind, Wallet } from './types';
import { uid } from '../lib/id';

interface WalletSeed { sysKey: string; icon: string; color: string }
interface CategorySeed { sysKey: string; icon: string; color: string; children?: CategorySeed[] }

export const DEFAULT_WALLETS: WalletSeed[] = [
  { sysKey: 'cash', icon: 'banknote', color: '#16a34a' },
  { sysKey: 'bankily', icon: 'smartphone', color: '#ea580c' },
  { sysKey: 'masrvi', icon: 'smartphone', color: '#2563eb' },
  { sysKey: 'sedad', icon: 'smartphone', color: '#9333ea' },
  { sysKey: 'bank', icon: 'landmark', color: '#0f766e' },
];

export const DEFAULT_EXPENSE_CATEGORIES: CategorySeed[] = [
  { sysKey: 'food', icon: 'utensils', color: '#f97316', children: [
    { sysKey: 'groceries', icon: 'shopping-basket', color: '#fb923c' },
    { sysKey: 'restaurants', icon: 'coffee', color: '#fdba74' },
  ] },
  { sysKey: 'transport', icon: 'car', color: '#0ea5e9', children: [
    { sysKey: 'taxi', icon: 'car-taxi-front', color: '#38bdf8' },
    { sysKey: 'fuel', icon: 'fuel', color: '#7dd3fc' },
  ] },
  { sysKey: 'phone', icon: 'smartphone', color: '#6366f1' },
  { sysKey: 'rent', icon: 'home', color: '#a16207' },
  { sysKey: 'utilities', icon: 'zap', color: '#eab308' },
  { sysKey: 'family', icon: 'users', color: '#ec4899' },
  { sysKey: 'health', icon: 'heart-pulse', color: '#ef4444' },
  { sysKey: 'clothes', icon: 'shirt', color: '#8b5cf6' },
  { sysKey: 'education', icon: 'graduation-cap', color: '#14b8a6' },
  { sysKey: 'charity', icon: 'hand-heart', color: '#22c55e' },
  { sysKey: 'fees', icon: 'receipt', color: '#64748b' },
  { sysKey: 'other_expense', icon: 'circle-ellipsis', color: '#94a3b8' },
];

export const DEFAULT_INCOME_CATEGORIES: CategorySeed[] = [
  { sysKey: 'salary', icon: 'briefcase', color: '#16a34a' },
  { sysKey: 'commissions', icon: 'percent', color: '#0891b2' },
  { sysKey: 'services', icon: 'wrench', color: '#7c3aed' },
  { sysKey: 'gifts', icon: 'gift', color: '#db2777' },
  { sysKey: 'other_income', icon: 'circle-ellipsis', color: '#94a3b8' },
];

export function buildDefaultWallets(now = Date.now()): Wallet[] {
  return DEFAULT_WALLETS.map((w, i) => ({
    id: uid(), name: '', sysKey: w.sysKey, icon: w.icon, color: w.color,
    openingBalance: 0, archived: false, order: i, createdAt: now, updatedAt: now,
  }));
}

export function buildDefaultCategories(now = Date.now()): Category[] {
  const out: Category[] = [];
  const add = (kind: CategoryKind, seeds: CategorySeed[], parentId: string | null) =>
    seeds.forEach((s, i) => {
      const id = uid();
      out.push({ id, kind, parentId, name: '', sysKey: s.sysKey, icon: s.icon, color: s.color,
        archived: false, order: i, createdAt: now, updatedAt: now });
      if (s.children) add(kind, s.children, id);
    });
  add('expense', DEFAULT_EXPENSE_CATEGORIES, null);
  add('income', DEFAULT_INCOME_CATEGORIES, null);
  return out;
}
