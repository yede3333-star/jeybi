import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import type { TxType } from '../data/types';
import { useNames, useTags, useTemplates, useTransactions } from '../hooks/data';
import { buildSearchNames, matchText, parseQuery } from '../services/search';
import { useLiveQuery } from 'dexie-react-hooks';
import { listDebts } from '../repo/debts';
import { listGoals } from '../repo/goals';
import { Link } from 'react-router';
import { HandCoins, PiggyBank } from 'lucide-react';
import i18n from '../i18n';
import { useFmt } from '../hooks/fmt';
import { PageHeader, Sheet, Empty } from '../components/ui';
import { TxRow, groupByDay } from '../components/TxRow';
import { CategorySelect } from '../components/pickers';
import { DateField } from '../components/DatePicker';
import { expandCategoryIds, filterTransactions, sumFiltered, type TxFilter } from '../services/reports';
import { parseAmount } from '../lib/money';
import { fromDay, toDay } from '../lib/periodParams';
import { addDays } from 'date-fns';

const list = (s: string | null) => (s ? s.split(',').filter(Boolean) : []);
const PAGE = 150;

/** URL params ⇄ filter. Keeping filters in the URL lets reports link straight to their transactions. */
function useFilterParams() {
  const [params, setParams] = useSearchParams();
  const f = {
    q: params.get('q') ?? '',
    min: params.get('min') ?? '',
    max: params.get('max') ?? '',
    from: params.get('from') ?? '',
    to: params.get('to') ?? '',
    w: list(params.get('w')),
    c: list(params.get('c')),
    type: list(params.get('type')) as TxType[],
    tag: list(params.get('tag')),
  };
  const set = (patch: Partial<typeof f>) => {
    const next = { ...f, ...patch };
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(next)) {
      const s = Array.isArray(v) ? v.join(',') : v;
      if (s) out[k] = s;
    }
    setParams(out, { replace: true });
  };
  return [f, set] as const;
}

export default function Transactions() {
  const { t } = useTranslation();
  const fmt = useFmt();
  const nav = useNavigate();
  const txs = useTransactions();
  const { categories, wallets, walletName, categoryName } = useNames();
  const [f, setF] = useFilterParams();
  const templates = useTemplates();
  const debts = useLiveQuery(listDebts, []);
  const goals = useLiveQuery(listGoals, []);
  // Names as displayed, in both languages, so a search finds "بقالة" and "Épicerie" alike.
  const searchNames = useMemo(() => {
    const ar = i18n.getFixedT('ar'), fr = i18n.getFixedT('fr');
    return buildSearchNames(categories ?? [], wallets ?? [], templates ?? [], (k) => [ar(`sys.${k}`), fr(`sys.${k}`)], (debts ?? []).map((d) => d.debt));
  }, [categories, wallets, templates, debts]);
  // People (debts) and savings goals matching the search, shown above the transactions.
  const entityHits = useMemo(() => {
    const q = f.q ? parseQuery(f.q) : null;
    if (!q) return { debts: [], goals: [] };
    return {
      debts: (debts ?? []).filter((d) => matchText(q, `${d.debt.person} ${d.debt.note}`, [d.debt.amount, d.remaining])),
      goals: (goals ?? []).filter((g) => matchText(q, g.goal.name, [g.goal.target])),
    };
  }, [f.q, debts, goals]);
  const [showFilters, setShowFilters] = useState(false);
  const [limit, setLimit] = useState(PAGE);

  const filter: TxFilter = useMemo(() => ({
    text: f.q || undefined,
    names: searchNames,
    amountMin: f.min ? parseAmount(f.min) ?? undefined : undefined,
    amountMax: f.max ? parseAmount(f.max) ?? undefined : undefined,
    start: f.from ? fromDay(f.from) : undefined,
    end: f.to ? +addDays(fromDay(f.to), 1) : undefined,
    walletIds: f.w,
    categoryIds: f.c.length ? expandCategoryIds(f.c, categories ?? []) : undefined,
    types: f.type,
    tags: f.tag,
  }), [f.q, f.min, f.max, f.from, f.to, f.w.join(), f.c.join(), f.type.join(), f.tag.join(), categories, searchNames]);

  const rows = useMemo(() => (txs ? filterTransactions(txs, filter) : []), [txs, filter]);
  const sums = useMemo(() => sumFiltered(rows), [rows]);
  const groups = useMemo(() => groupByDay(rows.slice(0, limit)), [rows, limit]);

  const chips: Array<{ label: string; clear: () => void }> = [];
  if (f.from || f.to) chips.push({ label: `${f.from ? fmt.date(fromDay(f.from), 'medium') : '…'} – ${f.to ? fmt.date(fromDay(f.to), 'medium') : '…'}`, clear: () => setF({ from: '', to: '' }) });
  if (f.min || f.max) chips.push({ label: `${f.min || '0'} – ${f.max || '∞'}`, clear: () => setF({ min: '', max: '' }) });
  for (const id of f.w) chips.push({ label: walletName(id), clear: () => setF({ w: f.w.filter((x) => x !== id) }) });
  for (const id of f.c) chips.push({ label: categoryName(id, true), clear: () => setF({ c: f.c.filter((x) => x !== id) }) });
  for (const ty of f.type) chips.push({ label: t(`types.${ty}`), clear: () => setF({ type: f.type.filter((x) => x !== ty) }) });
  for (const tg of f.tag) chips.push({ label: `#${tg}`, clear: () => setF({ tag: f.tag.filter((x) => x !== tg) }) });
  const filtered = chips.length > 0 || !!f.q;

  return (
    <div>
      <PageHeader title={t('nav.transactions')} actions={
        <button className={`btn-ghost relative size-11 min-h-11 rounded-full p-0 ${chips.length ? 'text-teal-700 dark:text-teal-400' : ''}`}
          onClick={() => setShowFilters(true)} aria-label={t('filters.title')}>
          <SlidersHorizontal className="size-5" />
          {chips.length > 0 && <span className="absolute end-1.5 top-1.5 size-2.5 rounded-full bg-teal-600" />}
        </button>
      } />

      <div className="px-4">
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-5 -translate-y-1/2 text-muted" />
          <input className="input ps-10" type="search" value={f.q} placeholder={t('filters.searchPlaceholder')}
            onChange={(e) => { setLimit(PAGE); setF({ q: e.target.value }); }} />
        </div>
        {chips.length > 0 && (
          <div className="no-scrollbar mt-2 flex gap-1.5 overflow-x-auto">
            {chips.map((c, i) => (
              <button key={i} className="chip chip-on shrink-0" onClick={c.clear}>{c.label}<X className="size-3.5" /></button>
            ))}
            <button className="chip shrink-0" onClick={() => setF({ q: '', min: '', max: '', from: '', to: '', w: [], c: [], type: [], tag: [] })}>
              {t('filters.clearAll')}
            </button>
          </div>
        )}
      </div>

      {(entityHits.debts.length > 0 || entityHits.goals.length > 0) && (
        <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto px-4">
          {entityHits.debts.map((d) => (
            <Link key={d.debt.id} to="/debts" className="chip min-h-11 shrink-0 gap-2">
              <HandCoins className="size-4 text-muted" />{d.debt.person}
              <span className={`num text-sm font-bold ${d.debt.direction === 'owed_to_me' ? 'text-income' : 'text-expense'}`}>{fmt.money(d.remaining)}</span>
            </Link>
          ))}
          {entityHits.goals.map((g) => (
            <Link key={g.goal.id} to="/goals" className="chip min-h-11 shrink-0 gap-2">
              <PiggyBank className="size-4 text-muted" />{g.goal.name}<span className="num text-sm font-bold">{fmt.pct(g.pct)}</span>
            </Link>
          ))}
        </div>
      )}

      {txs && (
        <div className="card mx-4 mt-3 grid grid-cols-3 divide-x divide-line p-0 text-center rtl:divide-x-reverse">
          <div className="p-3"><p className="text-xs text-muted">{t('types.income')}</p><p className="num font-bold text-income">{fmt.money(sums.income)}</p></div>
          <div className="p-3"><p className="text-xs text-muted">{t('types.expense')}</p><p className="num font-bold text-expense">{fmt.money(sums.expense)}</p></div>
          <div className="p-3"><p className="text-xs text-muted">{t('filters.count')}</p><p className="num font-bold">{rows.length}</p></div>
        </div>
      )}

      {txs && rows.length === 0 && (
        <Empty icon={<Search className="size-10" />} title={filtered ? t('filters.noResults') : t('home.emptyTitle')} hint={filtered ? undefined : t('home.emptyHint')} />
      )}

      {groups.map((g) => {
        const dayNet = g.rows.reduce((a, r) => a + (r.tx.type === 'income' ? r.counted : r.tx.type === 'expense' ? -r.counted : 0), 0);
        return (
          <section key={g.day}>
            <div className="flex items-center justify-between px-5 pb-1 pt-4 text-sm font-semibold text-muted">
              <span>{fmt.dayLabel(g.day)}</span>
              <span className="num">{fmt.money(dayNet, { sign: true })}</span>
            </div>
            <div className="card mx-4 divide-y divide-line overflow-hidden">
              {g.rows.map(({ tx, counted }) => (
                <TxRow key={tx.id} tx={tx} fmt={fmt} counted={counted !== tx.amount ? counted : undefined} onClick={() => nav(`/tx/${tx.id}`)} />
              ))}
            </div>
          </section>
        );
      })}
      {rows.length > limit && (
        <div className="p-4"><button className="btn-soft w-full" onClick={() => setLimit(limit + PAGE)}>{t('common.showMore')}</button></div>
      )}

      <FilterSheet open={showFilters} onClose={() => setShowFilters(false)} f={f} setF={(p) => { setLimit(PAGE); setF(p); }}
        walletsList={(wallets ?? []).map((w) => ({ id: w.id, name: walletName(w.id) }))} hasCategories={!!categories?.length} />
    </div>
  );
}

type F = ReturnType<typeof useFilterParams>[0];

function FilterSheet({ open, onClose, f, setF, walletsList }: {
  open: boolean; onClose: () => void; f: F; setF: (p: Partial<F>) => void;
  walletsList: Array<{ id: string; name: string }>; hasCategories: boolean;
}) {
  const { t } = useTranslation();
  const { categoryName } = useNames();
  const tags = useTags();
  const toggle = <T extends string>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const [exact, setExact] = useState(false);
  const today = toDay(Date.now());

  return (
    <Sheet open={open} onClose={onClose} title={t('filters.title')} footer={<button className="btn-primary w-full" onClick={onClose}>{t('filters.show')}</button>}>
      <div className="space-y-5">
        <div>
          <span className="label">{t('filters.type')}</span>
          <div className="flex flex-wrap gap-2">
            {(['expense', 'income', 'transfer', 'debt'] as TxType[]).map((ty) => (
              <button key={ty} className={`chip ${f.type.includes(ty) ? 'chip-on' : ''}`} onClick={() => setF({ type: toggle(f.type, ty) })}>{t(`types.${ty}`)}</button>
            ))}
          </div>
        </div>
        <div>
          <span className="label">{t('filters.period')}</span>
          <div className="grid grid-cols-2 gap-2">
            <DateField clearable label={t('filters.from')} value={f.from} max={f.to || today} onChange={(v) => setF({ from: v })} />
            <DateField clearable label={t('filters.to')} value={f.to} min={f.from || undefined} onChange={(v) => setF({ to: v })} />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between">
            <span className="label">{t('filters.amount')}</span>
            <button className="text-sm font-semibold text-teal-700 dark:text-teal-400" onClick={() => { setExact(!exact); if (!exact) setF({ max: f.min }); }}>
              {exact ? t('filters.range') : t('filters.exact')}
            </button>
          </div>
          {exact ? (
            <input className="input num" dir="ltr" inputMode="decimal" value={f.min} placeholder="0" onChange={(e) => setF({ min: e.target.value, max: e.target.value })} />
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <input className="input num" dir="ltr" inputMode="decimal" value={f.min} placeholder={t('filters.from')} onChange={(e) => setF({ min: e.target.value })} />
              <input className="input num" dir="ltr" inputMode="decimal" value={f.max} placeholder={t('filters.to')} onChange={(e) => setF({ max: e.target.value })} />
            </div>
          )}
        </div>
        <div>
          <span className="label">{t('filters.wallets')}</span>
          <div className="flex flex-wrap gap-2">
            {walletsList.map((w) => (
              <button key={w.id} className={`chip ${f.w.includes(w.id) ? 'chip-on' : ''}`} onClick={() => setF({ w: toggle(f.w, w.id) })}>{w.name}</button>
            ))}
          </div>
        </div>
        <div>
          <span className="label">{t('filters.categories')}</span>
          {f.c.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {f.c.map((id) => <button key={id} className="chip chip-on" onClick={() => setF({ c: f.c.filter((x) => x !== id) })}>{categoryName(id, true)}<X className="size-3.5" /></button>)}
            </div>
          )}
          <CategorySelect value="" includeArchived placeholder={t('filters.addCategory')} onChange={(id) => id && !f.c.includes(id) && setF({ c: [...f.c, id] })} />
        </div>
        {tags.length > 0 && (
          <div>
            <span className="label">{t('filters.tags')}</span>
            <div className="flex flex-wrap gap-2">
              {tags.map((tg) => (
                <button key={tg} className={`chip ${f.tag.includes(tg) ? 'chip-on' : ''}`} onClick={() => setF({ tag: toggle(f.tag, tg) })}>#{tg}</button>
              ))}
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}

