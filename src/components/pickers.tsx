import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import type { Category, CategoryKind, ID, Wallet } from '../data/types';
import { IconBadge } from './Icon';
import { useBalances, useNames } from '../hooks/data';
import { useFmt } from '../hooks/fmt';

/**
 * Wallet choice: large buttons with each wallet's balance, nothing preselected for a new entry
 * (choosing is mandatory). `none`: an extra button for "no wallet" (an old debt).
 */
export function WalletPicker({ wallets, value, onChange, exclude, none, invalid = false }: {
  wallets: Wallet[]; value?: ID | null; onChange: (id: ID | null) => void; exclude?: ID;
  none?: string; invalid?: boolean;
}) {
  const { nameOf } = useNames();
  const balances = useBalances();
  const fmt = useFmt();
  const list = wallets.filter((w) => !w.archived && w.id !== exclude);
  const btn = (on: boolean) => `flex min-h-14 items-center gap-2 rounded-xl px-3 py-2 text-start ring-1 transition active:scale-[0.98] ${
    on ? 'bg-teal-600/10 ring-2 ring-teal-600 dark:ring-teal-400' : 'bg-surface ring-line'}`;
  return (
    <div className={`grid grid-cols-2 gap-2 rounded-2xl ${invalid ? 'p-1 ring-2 ring-amber-500/70' : ''}`} role="radiogroup">
      {list.map((w) => {
        const bal = balances?.byWallet.get(w.id) ?? 0;
        return (
          <button key={w.id} type="button" role="radio" aria-checked={w.id === value} onClick={() => onChange(w.id)} className={btn(w.id === value)}>
            <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: w.color }} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{nameOf(w)}</span>
              <span className={`num block text-xs ${bal < 0 ? 'text-expense' : 'text-muted'}`}>{fmt.money(bal)}</span>
            </span>
          </button>
        );
      })}
      {none && (
        <button type="button" role="radio" aria-checked={value === null} onClick={() => onChange(null)} className={`${btn(value === null)} col-span-2 text-sm`}>
          {none}
        </button>
      )}
    </div>
  );
}

/**
 * Category grid. Parents with sub-categories expand inline; `onPick` receives the chosen id
 * (the parent itself can be picked through its "general" entry).
 */
export function CategoryGrid({ kind, value, onPick }: { kind: CategoryKind; value?: ID; onPick: (id: ID) => void }) {
  const { t } = useTranslation();
  const { categories, nameOf } = useNames();
  const [openParent, setOpenParent] = useState<ID | null>(null);
  const { tops, children } = useMemo(() => {
    const list = (categories ?? []).filter((c) => c.kind === kind && !c.archived);
    const tops = list.filter((c) => !c.parentId);
    const children = new Map<ID, Category[]>();
    for (const c of list) if (c.parentId) children.set(c.parentId, [...(children.get(c.parentId) ?? []), c]);
    return { tops, children };
  }, [categories, kind]);
  const selectedParent = (categories ?? []).find((c) => c.id === value)?.parentId ?? value;

  const cell = (c: Category, onClick: () => void, active: boolean, label = nameOf(c), hasKids = false) => (
    <button
      key={c.id + label}
      type="button"
      onClick={onClick}
      className={`flex min-h-20 flex-col items-center justify-start gap-1 rounded-2xl p-1.5 text-center text-xs font-medium leading-tight ${
        active ? 'bg-teal-600/15 ring-2 ring-teal-600' : 'active:bg-black/5 dark:active:bg-white/5'
      }`}
    >
      <IconBadge name={c.icon} color={c.color} />
      <span className="line-clamp-2 flex items-center gap-0.5">
        {label}
        {hasKids && <ChevronDown className="size-3 shrink-0" />}
      </span>
    </button>
  );

  return (
    <div className="grid grid-cols-4 gap-1">
      {tops.map((c) => {
        const kids = children.get(c.id);
        const isOpen = openParent === c.id;
        return [
          cell(c, () => (kids?.length ? setOpenParent(isOpen ? null : c.id) : onPick(c.id)), selectedParent === c.id || isOpen, nameOf(c), !!kids?.length),
          isOpen && kids && (
            <div key={c.id + '-kids'} className="col-span-4 grid grid-cols-4 gap-1 rounded-2xl bg-black/5 p-1 dark:bg-white/5">
              {cell(c, () => onPick(c.id), value === c.id, t('categories.general'))}
              {kids.map((k) => cell(k, () => onPick(k.id), value === k.id))}
            </div>
          ),
        ];
      })}
    </div>
  );
}

/** Native <select> of categories (with sub-categories indented) — used by split rows and filters. */
export function CategorySelect({ kind, value, onChange, includeArchived = false, placeholder }: {
  kind?: CategoryKind; value: ID | ''; onChange: (id: ID) => void; includeArchived?: boolean; placeholder?: string;
}) {
  const { categories, nameOf } = useNames();
  const list = (categories ?? []).filter((c) => (!kind || c.kind === kind) && (includeArchived || !c.archived));
  const tops = list.filter((c) => !c.parentId);
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder ?? '—'}</option>
      {tops.flatMap((c) => [
        <option key={c.id} value={c.id}>{nameOf(c)}</option>,
        ...list.filter((k) => k.parentId === c.id).map((k) => (
          <option key={k.id} value={k.id}>{'   '}{nameOf(k)}</option>
        )),
      ])}
    </select>
  );
}
