import { useCallback, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslation } from 'react-i18next';
import type { Category, Debt, ID, Transaction, Wallet } from '../data/types';
import { db } from '../data/db';
import { listWallets } from '../repo/wallets';
import { listCategories } from '../repo/categories';
import { listActive, allTags } from '../repo/transactions';
import { listTemplates } from '../repo/templates';
import { getBalances, hasTransactions, recentTransactions, totalsBetween } from '../repo/summary';

export const useWallets = () => useLiveQuery(listWallets, []);
export const useCategories = () => useLiveQuery(listCategories, []);
export const useTransactions = () => useLiveQuery(listActive, []);
export const useTemplates = () => useLiveQuery(listTemplates, []);
export const useTags = () => useLiveQuery(allTags, [], [] as string[]);

/** Balances from the cached per-wallet flows — does not read every transaction. */
export const useBalances = () => useLiveQuery(getBalances, []);

/** Today's and this month's totals via indexed date ranges. */
export function usePeriodTotals(start: number, end: number) {
  return useLiveQuery(() => totalsBetween(start, end), [start, end]);
}

export const useRecent = (n: number) => useLiveQuery(() => recentTransactions(n), [n]);
export const useHasTransactions = () => useLiveQuery(hasTransactions, []);

/** Display names for built-in (translated) and user-created wallets/categories. */
export function useNames() {
  const { t } = useTranslation();
  const wallets = useWallets();
  const categories = useCategories();
  const wMap = useMemo(() => new Map((wallets ?? []).map((w) => [w.id, w])), [wallets]);
  const cMap = useMemo(() => new Map((categories ?? []).map((c) => [c.id, c])), [categories]);
  const nameOf = useCallback((e?: Wallet | Category) => (!e ? t('common.unknown') : e.sysKey ? t(`sys.${e.sysKey}`) : e.name), [t]);
  const walletName = useCallback((id?: ID) => nameOf(id ? wMap.get(id) : undefined), [wMap, nameOf]);
  const categoryName = useCallback(
    (id?: ID, withParent = false) => {
      const c = id ? cMap.get(id) : undefined;
      if (!c) return t('common.unknown');
      const p = withParent && c.parentId ? cMap.get(c.parentId) : undefined;
      return p ? `${nameOf(p)} / ${nameOf(c)}` : nameOf(c);
    },
    [cMap, nameOf, t],
  );
  const debts = useLiveQuery(() => db.debts.toArray(), []);
  const dMap = useMemo(() => new Map((debts ?? []).map((d) => [d.id, d])), [debts]);
  const debt = useCallback((id?: ID): Debt | undefined => (id ? dMap.get(id) : undefined), [dMap]);
  /** Label of a debt movement: "Lent to X", "Repayment from X"… */
  const debtLabel = useCallback((tx: Transaction) => {
    const d = tx.debtId ? dMap.get(tx.debtId) : undefined;
    const person = d?.person ?? t('common.unknown');
    const principal = !!d && d.principalTxId === tx.id;
    const key = d?.direction === 'i_owe' ? (principal ? 'borrowedFrom' : 'repaidTo') : (principal ? 'lentTo' : 'repaidBy');
    return t(`debts.label.${key}`, { person });
  }, [dMap, t]);
  const wallet = useCallback((id?: ID) => (id ? wMap.get(id) : undefined), [wMap]);
  const category = useCallback((id?: ID) => (id ? cMap.get(id) : undefined), [cMap]);
  return { wallet, category, walletName, categoryName, nameOf, wallets, categories, debt, debtLabel, ready: !!wallets && !!categories };
}
