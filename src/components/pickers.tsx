import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import type { Category, CategoryKind, ID, Wallet } from '../data/types';
import { IconBadge } from './Icon';
import { useNames } from '../hooks/data';

/** Horizontal wallet chips. */
export function WalletChips({ wallets, value, onChange, exclude }: {
  wallets: Wallet[]; value?: ID; onChange: (id: ID) => void; exclude?: ID;
}) {
  const { nameOf } = useNames();
  return (
    <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
      {wallets.filter((w) => !w.archived && w.id !== exclude).map((w) => (
        <button
          key={w.id}
          type="button"
          onClick={() => onChange(w.id)}
          className={`chip shrink-0 ${w.id === value ? 'chip-on' : ''}`}
          aria-pressed={w.id === value}
        >
          <span className="size-2.5 rounded-full" style={{ backgroundColor: w.color }} />
          {nameOf(w)}
        </button>
      ))}
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
