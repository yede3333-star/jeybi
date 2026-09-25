import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Archive, ArchiveRestore, ArrowDown, ArrowUp, Check, Plus, Trash2 } from 'lucide-react';
import type { Category, CategoryKind, ID, Template, Wallet } from '../data/types';
import { PageHeader, Segmented, Sheet, Empty, Toggle } from '../components/ui';
import { COLORS, ICON_NAMES, Icon, IconBadge } from '../components/Icon';
import { CategorySelect, WalletPicker } from '../components/pickers';
import { useToast } from '../components/Toast';
import { useBalances, useNames, useTemplates } from '../hooks/data';
import { useFmt } from '../hooks/fmt';
import { createWallet, removeWallet, updateWallet } from '../repo/wallets';
import { createCategory, removeCategory, updateCategory } from '../repo/categories';
import { removeTemplate, reorderTemplates, saveTemplate } from '../repo/templates';
import { minorToKeypad, parseAmount } from '../lib/money';

function IconColorPicker({ icon, color, onIcon, onColor }: { icon: string; color: string; onIcon: (v: string) => void; onColor: (v: string) => void }) {
  const { t } = useTranslation();
  return (
    <>
      <div>
        <span className="label">{t('manage.color')}</span>
        <div className="flex flex-wrap gap-2">
          {COLORS.map((c) => (
            <button key={c} type="button" onClick={() => onColor(c)} className="flex size-9 items-center justify-center rounded-full text-white" style={{ backgroundColor: c }} aria-label={c}>
              {c === color && <Check className="size-5" />}
            </button>
          ))}
        </div>
      </div>
      <div>
        <span className="label">{t('manage.icon')}</span>
        <div className="grid grid-cols-7 gap-1.5">
          {ICON_NAMES.map((n) => (
            <button key={n} type="button" onClick={() => onIcon(n)} aria-label={n}
              className={`flex aspect-square items-center justify-center rounded-xl ${n === icon ? 'text-white' : 'bg-black/5 dark:bg-white/5'}`}
              style={n === icon ? { backgroundColor: color } : undefined}>
              <Icon name={n} />
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

// ---------------- Wallets ----------------

export function WalletsPage() {
  const { t } = useTranslation();
  const fmt = useFmt();
  const { wallets, nameOf } = useNames();
  const balances = useBalances();
  const [edit, setEdit] = useState<Wallet | 'new' | null>(null);
  const active = wallets?.filter((w) => !w.archived) ?? [];
  const archived = wallets?.filter((w) => w.archived) ?? [];

  const row = (w: Wallet) => {
    const bal = balances?.byWallet.get(w.id) ?? 0;
    return (
      <div key={w.id} className="flex min-h-16 items-center gap-2 pe-2">
        <button onClick={() => setEdit(w)} className="flex min-h-16 flex-1 items-center gap-3 ps-4 text-start active:bg-black/5">
          <IconBadge name={w.icon} color={w.color} />
          <span className="flex-1 font-semibold">{nameOf(w)}</span>
          <span className={`num font-bold ${bal < 0 ? 'text-expense' : ''}`}>{fmt.money(bal)}</span>
        </button>
        {bal < 0 && !w.archived && <Link to="/reconcile" className="btn-danger min-h-9 px-2.5 text-xs">{t('reconcile.action')}</Link>}
      </div>
    );
  };

  return (
    <div>
      <PageHeader back title={t('settings.wallets')} actions={
        <button className="btn-ghost size-11 min-h-11 rounded-full p-0" onClick={() => setEdit('new')} aria-label={t('common.add')}><Plus className="size-6" /></button>
      } />
      <div className="px-4">
        <div className="card divide-y divide-line overflow-hidden">{active.map(row)}</div>
        {archived.length > 0 && (
          <>
            <h2 className="section-title">{t('manage.archived')}</h2>
            <div className="card divide-y divide-line overflow-hidden opacity-70">{archived.map(row)}</div>
          </>
        )}
        <p className="p-2 text-sm text-muted">{t('manage.walletHint')}</p>
      </div>
      {edit && <WalletForm wallet={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function WalletForm({ wallet, onClose }: { wallet: Wallet | null; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const fmt = useFmt();
  const { nameOf } = useNames();
  const [name, setName] = useState(wallet ? nameOf(wallet) : '');
  const [icon, setIcon] = useState(wallet?.icon ?? 'wallet');
  const [color, setColor] = useState(wallet?.color ?? COLORS[1]);
  const [opening, setOpening] = useState(wallet ? minorToKeypad(wallet.openingBalance) : '');
  const [allowNegative, setAllowNegative] = useState(!!wallet?.allowNegative);

  const save = async () => {
    if (!name.trim()) return;
    const openingBalance = parseAmount(opening || '0') ?? 0;
    if (wallet) await updateWallet(wallet.id, { name, icon, color, openingBalance, allowNegative }, name !== nameOf(wallet));
    else {
      const w = await createWallet({ name, icon, color, openingBalance });
      if (allowNegative) await updateWallet(w.id, { allowNegative });
    }
    onClose();
  };
  const remove = async () => {
    if (!wallet) return;
    const r = await removeWallet(wallet.id);
    toast({ message: r === 'archived' ? t('manage.archivedBecauseUsed') : t('manage.deleted') });
    onClose();
  };

  return (
    <Sheet open onClose={onClose} title={wallet ? t('manage.editWallet') : t('manage.newWallet')}
      footer={<button className="btn-primary w-full" disabled={!name.trim()} onClick={save}>{t('common.save')}</button>}>
      <div className="space-y-4">
        <div>
          <label className="label" htmlFor="wname">{t('manage.name')}</label>
          <input id="wname" className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="wopen">{t('manage.openingBalance')} ({fmt.currencyLabel})</label>
          <input id="wopen" className="input num" dir="ltr" inputMode="decimal" placeholder="0" value={opening} onChange={(e) => setOpening(e.target.value)} />
        </div>
        <IconColorPicker icon={icon} color={color} onIcon={setIcon} onColor={setColor} />
        <div className="flex items-center gap-3 rounded-xl bg-black/[0.03] p-3 dark:bg-white/[0.04]">
          <span className="flex-1"><span className="block text-sm font-semibold">{t('manage.allowNegative')}</span><span className="block text-xs text-muted">{t('manage.allowNegativeHint')}</span></span>
          <Toggle checked={allowNegative} onChange={setAllowNegative} label={t('manage.allowNegative')} />
        </div>
        {wallet && (
          <div className="grid grid-cols-2 gap-2">
            <button className="btn-soft" onClick={async () => { await updateWallet(wallet.id, { archived: !wallet.archived }); onClose(); }}>
              {wallet.archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
              {wallet.archived ? t('manage.unarchive') : t('manage.archive')}
            </button>
            <button className="btn-danger" onClick={remove}><Trash2 className="size-4" />{t('common.delete')}</button>
          </div>
        )}
      </div>
    </Sheet>
  );
}

// ---------------- Categories ----------------

export function CategoriesPage() {
  const { t } = useTranslation();
  const { categories, nameOf } = useNames();
  const [kind, setKind] = useState<CategoryKind>('expense');
  const [edit, setEdit] = useState<Category | 'new' | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const list = (categories ?? []).filter((c) => c.kind === kind && (showArchived || !c.archived));
  const tops = list.filter((c) => !c.parentId);

  return (
    <div>
      <PageHeader back title={t('settings.categories')} actions={
        <button className="btn-ghost size-11 min-h-11 rounded-full p-0" onClick={() => setEdit('new')} aria-label={t('common.add')}><Plus className="size-6" /></button>
      } />
      <div className="space-y-3 px-4">
        <Segmented<CategoryKind> value={kind} onChange={setKind}
          options={[{ value: 'expense', label: t('types.expense') }, { value: 'income', label: t('types.income') }]} />
        <div className="card divide-y divide-line overflow-hidden">
          {tops.map((c) => (
            <div key={c.id}>
              <button onClick={() => setEdit(c)} className={`flex min-h-14 w-full items-center gap-3 px-4 text-start ${c.archived ? 'opacity-50' : ''}`}>
                <IconBadge name={c.icon} color={c.color} size="sm" />
                <span className="flex-1 font-semibold">{nameOf(c)}</span>
                {c.archived && <Archive className="size-4 text-muted" />}
              </button>
              {list.filter((k) => k.parentId === c.id).map((k) => (
                <button key={k.id} onClick={() => setEdit(k)} className={`flex min-h-12 w-full items-center gap-3 pe-4 ps-12 text-start ${k.archived ? 'opacity-50' : ''}`}>
                  <IconBadge name={k.icon} color={k.color} size="sm" />
                  <span className="flex-1">{nameOf(k)}</span>
                  {k.archived && <Archive className="size-4 text-muted" />}
                </button>
              ))}
            </div>
          ))}
        </div>
        <label className="flex items-center gap-2 px-1 text-sm text-muted">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="size-4" />
          {t('manage.showArchived')}
        </label>
      </div>
      {edit && <CategoryForm category={edit === 'new' ? null : edit} kind={kind} onClose={() => setEdit(null)} />}
    </div>
  );
}

function CategoryForm({ category, kind, onClose }: { category: Category | null; kind: CategoryKind; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { categories, nameOf } = useNames();
  const [name, setName] = useState(category ? nameOf(category) : '');
  const [icon, setIcon] = useState(category?.icon ?? 'tag');
  const [color, setColor] = useState(category?.color ?? COLORS[12]);
  const [parentId, setParentId] = useState<ID | ''>(category?.parentId ?? '');
  const hasChildren = !!category && (categories ?? []).some((c) => c.parentId === category.id);
  const parents = (categories ?? []).filter((c) => c.kind === (category?.kind ?? kind) && !c.parentId && c.id !== category?.id && !c.archived);

  const save = async () => {
    if (!name.trim()) return;
    if (category) await updateCategory(category.id, { name, icon, color, parentId: parentId || null }, name !== nameOf(category));
    else await createCategory({ kind, parentId: parentId || null, name, icon, color });
    onClose();
  };
  const remove = async () => {
    if (!category) return;
    const r = await removeCategory(category.id);
    toast({ message: r === 'archived' ? t('manage.archivedBecauseUsed') : t('manage.deleted') });
    onClose();
  };

  return (
    <Sheet open onClose={onClose} title={category ? t('manage.editCategory') : t('manage.newCategory')}
      footer={<button className="btn-primary w-full" disabled={!name.trim()} onClick={save}>{t('common.save')}</button>}>
      <div className="space-y-4">
        <div>
          <label className="label" htmlFor="cname">{t('manage.name')}</label>
          <input id="cname" className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        {!hasChildren && (
          <div>
            <label className="label" htmlFor="cparent">{t('manage.parent')}</label>
            <select id="cparent" className="input" value={parentId} onChange={(e) => setParentId(e.target.value)}>
              <option value="">{t('manage.noParent')}</option>
              {parents.map((p) => <option key={p.id} value={p.id}>{nameOf(p)}</option>)}
            </select>
          </div>
        )}
        <IconColorPicker icon={icon} color={color} onIcon={setIcon} onColor={setColor} />
        {category && (
          <div className="grid grid-cols-2 gap-2">
            <button className="btn-soft" onClick={async () => { await updateCategory(category.id, { archived: !category.archived }); onClose(); }}>
              {category.archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
              {category.archived ? t('manage.unarchive') : t('manage.archive')}
            </button>
            <button className="btn-danger" onClick={remove}><Trash2 className="size-4" />{t('common.delete')}</button>
          </div>
        )}
      </div>
    </Sheet>
  );
}

// ---------------- Templates ----------------

/** A template records into its own wallet; older templates may have none (or an archived one). */
export function templateWalletOk(tpl: Template, wallet: (id?: ID) => Wallet | undefined): boolean {
  const w = wallet(tpl.walletId);
  return !!w && !w.archived;
}

export function TemplatesPage() {
  const { t } = useTranslation();
  const fmt = useFmt();
  const templates = useTemplates();
  const { category, categoryName, wallet } = useNames();
  const [params, setParams] = useSearchParams();
  const [edit, setEdit] = useState<Template | 'new' | null>(null);

  useEffect(() => {
    if (params.get('new')) { setEdit('new'); setParams({}, { replace: true }); }
  }, [params, setParams]);

  const move = async (i: number, d: -1 | 1) => {
    if (!templates) return;
    const ids = templates.map((x) => x.id);
    [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    await reorderTemplates(ids);
  };

  return (
    <div>
      <PageHeader back title={t('settings.templates')} actions={
        <button className="btn-ghost size-11 min-h-11 rounded-full p-0" onClick={() => setEdit('new')} aria-label={t('common.add')}><Plus className="size-6" /></button>
      } />
      <div className="px-4">
        {templates?.length === 0 && <Empty title={t('templates.empty')} hint={t('templates.emptyHint')}
          action={<button className="btn-primary mt-2" onClick={() => setEdit('new')}><Plus className="size-5" />{t('templates.add')}</button>} />}
        <div className="card divide-y divide-line overflow-hidden">
          {templates?.map((tpl, i) => {
            const c = category(tpl.categoryId);
            return (
              <div key={tpl.id} className="flex min-h-16 items-center gap-2 pe-2 ps-4">
                <button className="flex flex-1 items-center gap-3 text-start" onClick={() => setEdit(tpl)}>
                  <IconBadge name={c?.icon ?? 'tag'} color={c?.color ?? '#94a3b8'} size="sm" />
                  <span className="flex-1">
                    <span className="block font-semibold">{tpl.name}</span>
                    <span className="block text-sm text-muted">{categoryName(tpl.categoryId)}</span>
                    {!templateWalletOk(tpl, wallet) && <span className="block text-xs font-semibold text-expense">{t('tx.chooseWallet')}</span>}
                  </span>
                  <span className={`num font-bold ${tpl.type === 'income' ? 'text-income' : 'text-expense'}`}>{fmt.money(tpl.amount)}</span>
                </button>
                <div className="flex flex-col">
                  <button className="p-1 disabled:opacity-20" disabled={i === 0} onClick={() => move(i, -1)} aria-label="up"><ArrowUp className="size-4" /></button>
                  <button className="p-1 disabled:opacity-20" disabled={i === templates.length - 1} onClick={() => move(i, 1)} aria-label="down"><ArrowDown className="size-4" /></button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {edit && <TemplateForm tpl={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function TemplateForm({ tpl, onClose }: { tpl: Template | null; onClose: () => void }) {
  const { t } = useTranslation();
  const fmt = useFmt();
  const { wallets, categoryName, wallet } = useNames();
  const [type, setType] = useState<CategoryKind>(tpl?.type ?? 'expense');
  const [name, setName] = useState(tpl?.name ?? '');
  const [amount, setAmount] = useState(tpl ? minorToKeypad(tpl.amount) : '');
  const [categoryId, setCategoryId] = useState<ID | ''>(tpl?.categoryId ?? '');
  // mandatory: a template always records into its own wallet (one tap, no guessing)
  const [walletId, setWalletId] = useState<ID | ''>(tpl && templateWalletOk(tpl, wallet) ? tpl.walletId! : '');
  const [note, setNote] = useState(tpl?.note ?? '');
  const minor = parseAmount(amount) ?? 0;
  const valid = minor > 0 && !!categoryId && !!walletId;

  const save = async () => {
    if (!valid) return;
    await saveTemplate({ id: tpl?.id, name: name.trim() || categoryName(categoryId), type, amount: minor, categoryId, walletId: walletId || undefined, note, tags: tpl?.tags ?? [] });
    onClose();
  };

  return (
    <Sheet open onClose={onClose} title={tpl ? t('templates.edit') : t('templates.add')}
      footer={<button className="btn-primary w-full" disabled={!valid} onClick={save}>{t('common.save')}</button>}>
      <div className="space-y-4">
        <Segmented<CategoryKind> value={type} onChange={(v) => { setType(v); setCategoryId(''); }}
          options={[{ value: 'expense', label: t('types.expense') }, { value: 'income', label: t('types.income') }]} />
        <div>
          <label className="label" htmlFor="tname">{t('templates.name')}</label>
          <input id="tname" className="input" value={name} placeholder={t('templates.namePlaceholder')} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="tamount">{t('tx.amount')} ({fmt.currencyLabel})</label>
          <input id="tamount" className="input num" dir="ltr" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div>
          <span className="label">{t('tx.category')}</span>
          <CategorySelect kind={type} value={categoryId} onChange={setCategoryId} />
        </div>
        <div>
          <span className="label">{t('tx.wallet')}{!walletId && <span className="text-amber-700 dark:text-amber-300"> — {t('tx.chooseWallet')}</span>}</span>
          <WalletPicker wallets={wallets ?? []} value={walletId || undefined} onChange={(id) => id && setWalletId(id)} invalid={!walletId && !!tpl} />
        </div>
        <div>
          <label className="label" htmlFor="tnote">{t('tx.note')}</label>
          <input id="tnote" className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        {tpl && <button className="btn-danger w-full" onClick={async () => { await removeTemplate(tpl.id); onClose(); }}><Trash2 className="size-4" />{t('common.delete')}</button>}
      </div>
    </Sheet>
  );
}
