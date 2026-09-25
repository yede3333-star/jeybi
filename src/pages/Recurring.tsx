import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check, Plus, Repeat, Trash2, X } from 'lucide-react';
import type { Frequency, ID, Recurring as Rule } from '../data/types';
import { PageHeader, Segmented, Sheet, Empty, Toggle } from '../components/ui';
import { IconBadge } from '../components/Icon';
import { CategorySelect, WalletPicker } from '../components/pickers';
import { DateField, DateTimeField } from '../components/DatePicker';
import { useToast } from '../components/Toast';
import { useNames, useWallets } from '../hooks/data';
import { useFmt } from '../hooks/fmt';
import { confirmPending, dismissPending, listPending, listRecurring, removeRecurring, runRecurring, saveRecurring, setRecurringActive } from '../repo/recurring';
import { minorToKeypad, parseAmount } from '../lib/money';
import { fromDay, toDay } from '../lib/periodParams';
import { useImpactGuard } from '../components/Impact';
import { deltasForTx } from '../repo/impact';

export default function RecurringPage() {
  const guard = useImpactGuard();
  const { t } = useTranslation();
  const fmt = useFmt();
  const toast = useToast();
  const { category, categoryName, walletName, wallet } = useNames();
  const rules = useLiveQuery(listRecurring, []);
  const pending = useLiveQuery(listPending, []);
  const [edit, setEdit] = useState<Rule | 'new' | null>(null);

  return (
    <div>
      <PageHeader back title={t('recurring.title')} actions={
        <button className="btn-ghost size-11 min-h-11 rounded-full p-0" onClick={() => setEdit('new')} aria-label={t('common.add')}><Plus className="size-6" /></button>
      } />
      <div className="space-y-3 px-4">
        {pending && pending.length > 0 && (
          <>
            <h2 className="section-title">{t('recurring.pending', { n: pending.length })}</h2>
            <div className="card divide-y divide-line overflow-hidden">
              {pending.map((p) => (
                <div key={p.id} className="flex items-center gap-2 px-4 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{p.rule?.name ?? '—'}</span>
                    <span className="num block text-sm text-muted">{fmt.date(p.date, 'medium')} · {p.rule ? fmt.money(p.rule.amount) : ''}</span>
                  </span>
                  <button className="btn-soft min-h-10 px-3" onClick={async () => {
                    const go = p.rule ? await guard(deltasForTx({ type: p.rule.type, amount: p.rule.amount, walletId: p.rule.walletId, date: p.date })) : { after: async () => {} };
                    if (!go) return;
                    await confirmPending(p.id); await go.after(); toast({ message: t('recurring.confirmed') });
                  }} aria-label={t('common.confirm')}><Check className="size-4" /></button>
                  <button className="btn-ghost min-h-10 px-3" onClick={() => dismissPending(p.id)} aria-label={t('recurring.skip')}><X className="size-4" /></button>
                </div>
              ))}
            </div>
          </>
        )}
        {rules && rules.length === 0 && <Empty icon={<Repeat className="size-10" />} title={t('recurring.empty')} hint={t('recurring.emptyHint')} />}
        <div className="card divide-y divide-line overflow-hidden">
          {rules?.map((r) => {
            const c = category(r.categoryId);
            return (
              <div key={r.id} className={`flex items-center gap-3 px-4 py-2 ${r.active ? '' : 'opacity-50'}`}>
                <button className="flex min-w-0 flex-1 items-center gap-3 text-start" onClick={() => setEdit(r)}>
                  <IconBadge name={c?.icon ?? 'repeat'} color={c?.color ?? '#94a3b8'} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{r.name || categoryName(r.categoryId)}</span>
                    <span className="block truncate text-sm text-muted">
                      {t(`recurring.freq.${r.frequency}`)} · {walletName(r.walletId)} · {r.mode === 'confirm' ? t('recurring.modeConfirm') : t('recurring.modeAuto')}
                    </span>
                    {r.active && <span className="num block text-xs text-muted">{t('recurring.next')}: {fmt.date(r.nextDue, 'medium')}</span>}
                    {(!wallet(r.walletId) || wallet(r.walletId)!.archived) && <span className="block text-xs font-semibold text-expense">{t('tx.chooseWallet')}</span>}
                  </span>
                  <span className={`num font-bold ${r.type === 'income' ? 'text-income' : 'text-expense'}`}>{fmt.money(r.amount)}</span>
                </button>
                <Toggle checked={r.active} label={t('recurring.active')} onChange={(on) => setRecurringActive(r.id, on)} />
              </div>
            );
          })}
        </div>
        <p className="px-1 text-xs text-muted">{t('recurring.howItWorks')}</p>
      </div>
      {edit && <RuleForm rule={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function RuleForm({ rule, onClose }: { rule?: Rule; onClose: () => void }) {
  const { t } = useTranslation();
  const fmt = useFmt();
  const toast = useToast();
  const wallets = useWallets() ?? [];
  const [type, setType] = useState<'expense' | 'income'>(rule?.type ?? 'expense');
  const [name, setName] = useState(rule?.name ?? '');
  const [amount, setAmount] = useState(rule ? minorToKeypad(rule.amount) : '');
  const [categoryId, setCategoryId] = useState<ID | ''>(rule?.categoryId ?? '');
  // mandatory, never preselected; a rule whose wallet was archived/removed must get a new one
  const [walletId, setWalletId] = useState<ID | undefined>(rule && wallets.some((w) => w.id === rule.walletId && !w.archived) ? rule.walletId : undefined);
  const [frequency, setFrequency] = useState<Frequency>(rule?.frequency ?? 'monthly');
  const [start, setStart] = useState<number>(rule?.startDate ?? new Date().setHours(9, 0, 0, 0));
  const [end, setEnd] = useState(rule?.endDate != null ? toDay(rule.endDate) : '');
  const [mode, setMode] = useState<'auto' | 'confirm'>(rule?.mode ?? 'auto');
  const [note, setNote] = useState(rule?.note ?? '');
  const minor = parseAmount(amount) ?? 0;
  const valid = minor > 0 && !!categoryId && !!walletId;

  const save = async () => {
    if (!valid) return;
    await saveRecurring({ name: name.trim(), type, amount: minor, walletId: walletId!, categoryId, note, tags: rule?.tags ?? [], frequency,
      startDate: start, endDate: end ? fromDay(end) + 86_399_000 : null, mode, active: rule?.active ?? true, demo: rule?.demo }, rule?.id);
    const res = await runRecurring();
    toast({ message: res.created ? t('recurring.savedAndCreated', { n: res.created }) : t('recurring.saved') });
    onClose();
  };

  return (
    <Sheet open onClose={onClose} title={rule ? t('recurring.edit') : t('recurring.new')}
      footer={<button className="btn-primary w-full" disabled={!valid} onClick={save}>{t('common.save')}</button>}>
      <div className="space-y-4">
        <Segmented<'expense' | 'income'> value={type} onChange={(v) => { setType(v); setCategoryId(''); }}
          options={[{ value: 'expense', label: t('types.expense') }, { value: 'income', label: t('types.income') }]} />
        <div><label className="label" htmlFor="rname">{t('recurring.name')}</label>
          <input id="rname" className="input" value={name} placeholder={t('recurring.namePlaceholder')} onChange={(e) => setName(e.target.value)} /></div>
        <div><label className="label" htmlFor="ramount">{t('tx.amount')} ({fmt.currencyLabel})</label>
          <input id="ramount" className="input num text-lg" dir="ltr" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
        <div><span className="label">{t('tx.category')}</span><CategorySelect kind={type} value={categoryId} onChange={setCategoryId} /></div>
        <div><span className="label">{t('tx.wallet')}</span><WalletPicker wallets={wallets} value={walletId} onChange={(id) => id && setWalletId(id)} invalid={!walletId && !!rule} /></div>
        <div><span className="label">{t('recurring.frequency')}</span>
          <Segmented<Frequency> size="sm" value={frequency} onChange={setFrequency}
            options={(['daily', 'weekly', 'monthly', 'yearly'] as Frequency[]).map((f) => ({ value: f, label: t(`recurring.freq.${f}`) }))} /></div>
        <div><span className="label">{t('recurring.firstDate')}</span><DateTimeField value={start} onChange={setStart} label={t('recurring.firstDate')} />
          <p className="mt-1 text-xs text-muted">{t(`recurring.freqHint.${frequency}`)}</p></div>
        <div><span className="label">{t('recurring.endDate')}</span><DateField clearable value={end} onChange={setEnd} label={t('recurring.endDate')} placeholder={t('common.optional')} /></div>
        <div><span className="label">{t('recurring.mode')}</span>
          <Segmented<'auto' | 'confirm'> size="sm" value={mode} onChange={setMode}
            options={[{ value: 'auto', label: t('recurring.modeAuto') }, { value: 'confirm', label: t('recurring.modeConfirm') }]} /></div>
        <div><label className="label" htmlFor="rnote">{t('tx.note')}</label><input id="rnote" className="input" value={note} onChange={(e) => setNote(e.target.value)} /></div>
        {rule && (
          <button className="btn-danger w-full" onClick={async () => { await removeRecurring(rule.id); onClose(); }}>
            <Trash2 className="size-4" />{t('recurring.delete')}
          </button>
        )}
      </div>
    </Sheet>
  );
}
