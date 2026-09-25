import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { Camera, Check, Minus, Pencil, PiggyBank, Plus, Trash2 } from 'lucide-react';
import type { Goal, ID } from '../data/types';
import { PageHeader, Sheet, Empty } from '../components/ui';
import { COLORS, ICON_NAMES, Icon, IconBadge } from '../components/Icon';
import { WalletPicker } from '../components/pickers';
import { DateField } from '../components/DatePicker';
import { useToast } from '../components/Toast';
import { useNames, useWallets } from '../hooks/data';
import { useFmt } from '../hooks/fmt';
import { goalMovesOf, heldInWallet, listGoals, moveGoalMoney, removeGoal, saveGoal, type GoalProgress } from '../repo/goals';
import { getReceipt, saveReceipt } from '../repo/receipts';
import { compressImage } from '../services/image';
import { minorToKeypad, parseAmount } from '../lib/money';
import { fromDay, toDay } from '../lib/periodParams';
import { errorMessage } from '../services/errors';

function useImage(id?: string) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let u: string | null = null;
    if (id) void getReceipt(id).then((r) => r && setUrl((u = URL.createObjectURL(r.blob))));
    else setUrl(null);
    return () => { if (u) URL.revokeObjectURL(u); };
  }, [id]);
  return url;
}

export function GoalAvatar({ goal, size = 'md' }: { goal: Goal; size?: 'md' | 'lg' }) {
  const url = useImage(goal.imageId);
  const box = size === 'lg' ? 'size-16' : 'size-12';
  return url
    ? <img src={url} alt="" className={`${box} shrink-0 rounded-2xl object-cover`} />
    : <span className={`${box} inline-flex shrink-0 items-center justify-center rounded-2xl text-white`} style={{ backgroundColor: goal.color }}><Icon name={goal.icon} className="size-6" /></span>;
}

export default function Goals() {
  const { t } = useTranslation();
  const fmt = useFmt();
  const allGoals = useLiveQuery(listGoals, []);
  const [params, setParams] = useSearchParams();
  const walletFilter = params.get('wallet');
  const held = useLiveQuery(() => (walletFilter ? heldInWallet(walletFilter) : Promise.resolve(null)), [walletFilter]);
  const { walletName } = useNames();
  const goals = held ? allGoals?.filter((g) => (held.get(g.goal.id) ?? 0) > 0) : allGoals;
  const [edit, setEdit] = useState<Goal | 'new' | null>(null);
  const [open, setOpen] = useState<ID | null>(null);
  const opened = goals?.find((g) => g.goal.id === open);

  return (
    <div>
      <PageHeader back title={t('goals.title')} actions={
        <button className="btn-ghost size-11 min-h-11 rounded-full p-0" onClick={() => setEdit('new')} aria-label={t('common.add')}><Plus className="size-6" /></button>
      } />
      <div className="space-y-3 px-4">
        {walletFilter && (
          <div className="flex items-center gap-2 rounded-xl bg-teal-600/10 px-3 py-2 text-sm">
            <span className="flex-1 font-semibold">{t('goals.inWallet', { wallet: walletName(walletFilter) })}</span>
            <button className="font-semibold text-teal-700 underline dark:text-teal-300" onClick={() => setParams({}, { replace: true })}>{t('goals.showAll')}</button>
          </div>
        )}
        {goals && goals.length === 0 && <Empty icon={<PiggyBank className="size-10" />} title={t('goals.empty')} hint={t('goals.emptyHint')}
          action={<button className="btn-primary mt-2" onClick={() => setEdit('new')}><Plus className="size-5" />{t('goals.new')}</button>} />}
        {goals?.map((g) => (
          <button key={g.goal.id} className={`card block w-full p-4 text-start ${g.goal.archived ? 'opacity-60' : ''}`} onClick={() => setOpen(g.goal.id)}>
            <div className="flex items-center gap-3">
              <GoalAvatar goal={g.goal} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{g.goal.name}</p>
                <p className="num text-sm text-muted">{fmt.money(g.saved)} / {fmt.money(g.goal.target)}</p>
                {held && <p className="num text-xs font-semibold text-teal-700 dark:text-teal-300">{t('goals.heldHere', { amount: fmt.money(held.get(g.goal.id) ?? 0) })}</p>}
              </div>
              <span className="num text-lg font-extrabold">{fmt.pct(g.pct)}</span>
            </div>
            <span className="mt-3 block h-3 overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
              <span className="block h-3 rounded-full" style={{ width: `${g.pct}%`, backgroundColor: g.reached ? '#16a34a' : g.goal.color }} />
            </span>
            <GoalHint g={g} />
          </button>
        ))}
        <p className="px-1 text-xs text-muted">{t('goals.reservedHint')}</p>
      </div>
      {edit && <GoalForm goal={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
      {opened && <GoalDetail g={opened} onClose={() => setOpen(null)} onEdit={() => { setEdit(opened.goal); setOpen(null); }} />}
    </div>
  );
}

function GoalHint({ g }: { g: GoalProgress }) {
  const { t } = useTranslation();
  const fmt = useFmt();
  if (g.reached) return <p className="mt-2 flex items-center gap-1 text-sm font-semibold text-income"><Check className="size-4" />{t('goals.reached')}</p>;
  return (
    <p className={`mt-2 text-sm ${g.late ? 'font-semibold text-expense' : 'text-muted'}`}>
      {g.goal.targetDate != null && (g.late ? t('goals.late') : `${t('goals.by')} ${fmt.date(g.goal.targetDate, 'medium')}`)}
      {g.monthlyNeeded != null && <> · <span className="num">{t('goals.perMonth', { amount: fmt.money(g.monthlyNeeded) })}</span></>}
      {g.goal.targetDate == null && <span className="num">{t('goals.remaining', { amount: fmt.money(g.remaining) })}</span>}
    </p>
  );
}

function GoalDetail({ g, onClose, onEdit }: { g: GoalProgress; onClose: () => void; onEdit: () => void }) {
  const { t } = useTranslation();
  const fmt = useFmt();
  const toast = useToast();
  const { walletName } = useNames();
  const moves = useLiveQuery(() => goalMovesOf(g.goal.id), [g.goal.id]);
  const [move, setMove] = useState<'in' | 'out' | null>(null);
  return (
    <Sheet open onClose={onClose} title={g.goal.name}
      footer={<div className="grid grid-cols-2 gap-2">
        <button className="btn-primary" onClick={() => setMove('in')}><Plus className="size-4" />{t('goals.add')}</button>
        <button className="btn-soft" disabled={g.saved <= 0} onClick={() => setMove('out')}><Minus className="size-4" />{t('goals.withdraw')}</button>
      </div>}>
      <div className="space-y-3">
        <div className="card flex items-center gap-4 p-4">
          <GoalAvatar goal={g.goal} size="lg" />
          <div className="flex-1">
            <p className="num text-2xl font-extrabold">{fmt.money(g.saved)}</p>
            <p className="num text-sm text-muted">{t('goals.of', { target: fmt.money(g.goal.target) })}</p>
            <GoalHint g={g} />
          </div>
        </div>
        <h3 className="section-title">{t('goals.history')}</h3>
        <div className="card divide-y divide-line">
          {moves?.length === 0 && <p className="p-4 text-center text-sm text-muted">{t('goals.noMoves')}</p>}
          {moves?.map((m) => (
            <div key={m.id} className="flex items-center gap-3 px-4 py-3 text-sm">
              <span className="flex-1">{walletName(m.walletId)} · {fmt.date(m.date, 'medium')}{m.note ? ` · ${m.note}` : ''}</span>
              <span className={`num font-semibold ${m.amount > 0 ? 'text-income' : 'text-expense'}`}>{fmt.money(m.amount, { sign: true })}</span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-soft" onClick={onEdit}><Pencil className="size-4" />{t('common.edit')}</button>
          <button className="btn-danger" onClick={async () => {
            if (!confirm(t('goals.deleteConfirm'))) return;
            const { undo } = await removeGoal(g.goal.id);
            onClose();
            toast({ message: t('goals.deleted'), undo });
          }}><Trash2 className="size-4" />{t('common.delete')}</button>
        </div>
      </div>
      {move && <MoveForm goalId={g.goal.id} dir={move} onClose={() => setMove(null)} />}
    </Sheet>
  );
}

function MoveForm({ goalId, dir, onClose }: { goalId: ID; dir: 'in' | 'out'; onClose: () => void }) {
  const { t } = useTranslation();
  const fmt = useFmt();
  const toast = useToast();
  const wallets = useWallets() ?? [];
  const [walletId, setWalletId] = useState<ID | undefined>(undefined);
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    try {
      const v = parseAmount(amount) ?? 0;
      const { undo } = await moveGoalMoney(goalId, walletId ?? '', dir === 'in' ? v : -v);
      toast({ message: dir === 'in' ? t('goals.added') : t('goals.withdrawn'), undo });
      onClose();
    } catch (e) {
      setError(errorMessage(e, t));
    }
  };
  return (
    <Sheet open onClose={onClose} title={dir === 'in' ? t('goals.add') : t('goals.withdraw')}
      footer={<div className="space-y-2">{error && <p className="text-sm text-expense">{error}</p>}<button className="btn-primary w-full" disabled={!walletId} onClick={save}>{t('common.save')}</button></div>}>
      <div className="space-y-4">
        <div><label className="label" htmlFor="gamount">{t('tx.amount')} ({fmt.currencyLabel})</label>
          <input id="gamount" className="input num text-lg" dir="ltr" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /></div>
        <div><span className="label">{t('tx.wallet')}</span><WalletPicker wallets={wallets} value={walletId} onChange={(id) => id && setWalletId(id)} /></div>
        <p className="text-xs text-muted">{dir === 'in' ? t('goals.addHint') : t('goals.withdrawHint')}</p>
      </div>
    </Sheet>
  );
}

function GoalForm({ goal, onClose }: { goal?: Goal; onClose: () => void }) {
  const { t } = useTranslation();
  const fmt = useFmt();
  const [name, setName] = useState(goal?.name ?? '');
  const [target, setTarget] = useState(goal ? minorToKeypad(goal.target) : '');
  const [date, setDate] = useState(goal?.targetDate != null ? toDay(goal.targetDate) : '');
  const [icon, setIcon] = useState(goal?.icon ?? 'piggy-bank');
  const [color, setColor] = useState(goal?.color ?? COLORS[1]);
  const [imageId, setImageId] = useState<string | undefined>(goal?.imageId);
  const [error, setError] = useState<string | null>(null);
  const preview = useImage(imageId);
  const save = async () => {
    try {
      await saveGoal({ id: goal?.id, name, target: parseAmount(target) ?? 0, targetDate: date ? fromDay(date) + 12 * 3600e3 : null, icon, color, imageId });
      onClose();
    } catch (e) {
      setError(errorMessage(e, t));
    }
  };
  return (
    <Sheet open onClose={onClose} title={goal ? t('goals.edit') : t('goals.new')}
      footer={<div className="space-y-2">{error && <p className="text-sm text-expense">{error}</p>}<button className="btn-primary w-full" onClick={save}>{t('common.save')}</button></div>}>
      <div className="space-y-4">
        <div><label className="label" htmlFor="gname">{t('goals.name')}</label>
          <input id="gname" className="input" value={name} placeholder={t('goals.namePlaceholder')} onChange={(e) => setName(e.target.value)} /></div>
        <div><label className="label" htmlFor="gtarget">{t('goals.target')} ({fmt.currencyLabel})</label>
          <input id="gtarget" className="input num text-lg" dir="ltr" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} /></div>
        <div><span className="label">{t('goals.targetDate')}</span><DateField clearable value={date} onChange={setDate} label={t('goals.targetDate')} placeholder={t('common.optional')} /></div>
        <div>
          <span className="label">{t('goals.picture')}</span>
          <div className="flex items-center gap-3">
            {preview ? <img src={preview} alt="" className="size-16 rounded-2xl object-cover" /> : <IconBadge name={icon} color={color} size="lg" />}
            <label className="btn-soft cursor-pointer"><Camera className="size-4" />{t('goals.choosePicture')}
              <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) setImageId(await saveReceipt(await compressImage(f, 600)));
              }} />
            </label>
            {imageId && <button className="btn-ghost" onClick={() => setImageId(undefined)}>{t('common.remove')}</button>}
          </div>
        </div>
        {!imageId && (
          <>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => <button key={c} onClick={() => setColor(c)} className="flex size-9 items-center justify-center rounded-full text-white" style={{ backgroundColor: c }} aria-label={c}>{c === color && <Check className="size-5" />}</button>)}
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {ICON_NAMES.map((n) => (
                <button key={n} onClick={() => setIcon(n)} aria-label={n} className={`flex aspect-square items-center justify-center rounded-xl ${n === icon ? 'text-white' : 'bg-black/5 dark:bg-white/5'}`} style={n === icon ? { backgroundColor: color } : undefined}>
                  <Icon name={n} />
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
