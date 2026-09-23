import { useCallback, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslation } from 'react-i18next';
import type { Category, ID, Wallet } from '../data/types';
import { listWallets } from '../repo/wallets';
import { listCategories } from '../repo/categories';
import { listActive, allTags } from '../repo/transactions';
import { listTemplates } from '../repo/templates';
import { walletBalances } from '../services/reports';

export const useWallets = () => useLiveQuery(listWallets, []);
export const useCategories = () => useLiveQuery(listCategories, []);
export const useTransactions = () => useLiveQuery(listActive, []);
export const useTemplates = () => useLiveQuery(listTemplates, []);
export const useTags = () => useLiveQuery(allTags, [], [] as string[]);

export function useBalances() {
  const wallets = useWallets();
  const txs = useTransactions();
  return useMemo(() => {
    if (!wallets || !txs) return undefined;
    const m = walletBalances(wallets, txs);
    let total = 0;
    for (const v of m.values()) total += v;
    return { byWallet: m, total };
  }, [wallets, txs]);
}

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
  const wallet = useCallback((id?: ID) => (id ? wMap.get(id) : undefined), [wMap]);
  const category = useCallback((id?: ID) => (id ? cMap.get(id) : undefined), [cMap]);
  return { wallet, category, walletName, categoryName, nameOf, wallets, categories, ready: !!wallets && !!categories };
}
