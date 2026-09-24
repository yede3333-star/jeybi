import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, CheckCircle2, HandCoins, Pencil, Plus, Trash2 } from 'lucide-react';
import type { Debt, DebtDirection, ID } from '../data/types';
import { PageHeader, Segmented, Sheet, Empty, Toggle } from '../components/ui';
import { DateField } from '../components/DatePicker';
import { WalletChips } from '../components/pickers';
import { useToast } from '../components/Toast';
import { useWallets, useNames } from '../hooks/data';
import { useFmt } from '../hooks/fmt';
import { addRepayment, createDebt, getDebt, listDebts, removeDebt, summarize, updateDebt, type DebtStatus } from '../repo/debts';
import { deleteTransaction } from '../repo/transactions';
import { parseAmount, minorToKeypad } from '../lib/money';
import { fromDay, toDay } from '../lib/periodParams';
import { errorMessage } from '../services/errors';

export default function Debts() {
  const { t } = useTranslation();
  const fmt = useFmt();
  const debts = useLiveQuery(listDebts, []);
  const [tab, setTab] = useState<'open' | 'closed'>('open');
  const [form, setForm] = useState<{ debt?: Debt; direction: DebtDirection } | null>(null);
  const [openId, setOpenId] = useState<ID | null>(null);
  const summary = debts ? summarize(debts) : null;
  const shown = (debts ?? []).filter((d) => (tab === 'open' ? !d.closed : d.closed));

  return (
    <div>
      <PageHeader back title={t('debts.title')} />
      <div className="space-y-3 px-4">
        {summary && (
          <div className="grid grid-cols-2 gap-2">
            <div className="card p-3">
              <p className="text-sm text-muted">{t('debts.owedToMe')}</p>
              <p className="num text-xl font-bold text-income">{fmt.money(summary.owedToMe)}</p>
            </div>
            <div className="card p-3">
              <p className="text-sm text-muted">{t('debts.iOwe')}</p>
              <p className="num text-xl font-bold text-expense">{fmt.money(summary.iOwe)}</p>
            </div>
            {summary.overdue > 0 && (
              <p className="col-span-2 flex items-center gap-2 rounded-xl bg-red-600/10 p-3 text-sm font-semibold text-red-700 dark:text-red-400">
                <AlertTriangle className="size-4" />{t('debts.overdueCount', { n: summary.overdue })}
              </p>
            )}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-soft" onClick={() => setForm({ direction: 'owed_to_me' })}><Plus className="size-4" />{t('debts.lend')}</button>
          <button className="btn-soft" onClick={() => setForm({ direction: 'i_owe' })}><Plus className="size-4" />{t('debts.borrow')}</button>
        </div>
        <Segmented<'open' | 'closed'> size="sm" value={tab} onChange={setTab}
          options={[{ value: 'open', label: t('debts.open') }, { value: 'closed', label: t('debts.closed') }]} />
        {debts && shown.length === 0 && <Empty icon={<HandCoins className="size-10" />} title={t('debts.empty')} hint={tab === 'open' ? t('debts.emptyHint') : undefined} />}
        <div className="card divide-y divide-line overflow-hidden">
          {shown.map((d) => <DebtRow key={d.debt.id} st={d} onClick={() => setOpenId(d.debt.id)} />)}
        </div>
      </div>
      {form && <DebtForm debt={form.debt} direction={form.direction} onClose={() => setForm(null)} />}
      {openId && <DebtDetail id={openId} onClose={() => setOpenId(null)} onEdit={(debt) => { setOpenId(null); setForm({ debt, direction: debt.direction }); }} />}
    </div>
  );
}

function DebtRow({ st, onClick }: { st: DebtStatus; onClick: () => void }) {
  const { t } = useTranslation();
  const fmt = useFmt();
  const mine = st.debt.direction === 'owed_to_me';
  return (
    <button onClick={onClick} className={`flex min-h-16 w-full items-center gap-3 px-4 py-2 text-start ${st.overdue ? 'bg-red-600/5' : ''}`}>
      <span className={`inline-flex size-10 shrink-0 items-center justify-center rounded-full text-white ${mine ? 'bg-emerald-600' : 'bg-rose-600'}`}>
        <HandCoins className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{st.debt.person}</span>
        <span className={`block truncate text-sm ${st.overdue ? 'font-semibold text-expense' : 'text-muted'}`}>
          {mine ? t('debts.owesMe') : t('debts.iOweHim')}
          {st.debt.dueDate != null && ` · ${st.overdue ? t('debts.overdueSince') : t('debts.due')} ${fmt.date(st.debt.dueDate, 'medium')}`}
        </span>
        {st.paid > 0 && !st.closed && (
          <span className="mt-1 block h-1.5 rounded-full bg-black/5 dark:bg-white/10">
            <span className="block h-1.5 rounded-full bg-teal-600" style={{ width: `${(st.paid / st.debt.amount) * 100}%` }} />
          </span>
        )}
      </span>
      <span className="text-end">
        <span className={`num block font-bold ${mine ? 'text-income' : 'text-expense'}`}>{fmt.money(st.closed ? st.debt.amount : st.remaining)}</span>
        {st.closed ? <span className="text-xs text-muted">{t('debts.paidInFull')}</span>
          : st.paid > 0 && <span className="num text-xs text-muted">{t('debts.of', { total: fmt.money(st.debt.amount) })}</span>}
      </span>
    </button>
  );
}

function DebtDetail({ id, onClose, onEdit }: { id: ID; onClose: () => void; onEdit: (d: Debt) => void }) {
  const { t } = useTranslation();
  const fmt = useFmt();
  const toast = useToast();
  const { walletName } = useNames();
  const data = useLiveQuery(() => getDebt(id), [id]);
  const [pay, setPay] = useState(false);
  if (!data) return null;
  const { status: st, movements } = data;
  const mine = st.debt.direction === 'owed_to_me';
  return (
    <Sheet open onClose={onClose} title={st.debt.person}
      footer={!st.closed ? <button className="btn-primary w-full" onClick={() => setPay(true)}><HandCoins className="size-5" />{mine ? t('debts.receivePayment') : t('debts.makePayment')}</button> : undefined}>
      <div className="space-y-3">
        <div className="card p-4 text-center">
          <p className="text-sm text-muted">{mine ? t('debts.owesMe') : t('debts.iOweHim')}</p>
          <p className={`num text-3xl font-extrabold ${mine ? 'text-income' : 'text-expense'}`}>{fmt.money(st.remaining)}</p>
          <p className="num text-sm text-muted">{t('debts.paidOf', { paid: fmt.money(st.paid), total: fmt.money(st.debt.amount) })}</p>
          {st.closed && <p className="mt-2 inline-flex items-center gap-1 font-semibold text-income"><CheckCircle2 className="size-4" />{t('debts.paidInFull')}</p>}
          {st.overdue && <p className="mt-2 font-semibold text-expense">{t('debts.overdueSince')} {fmt.date(st.debt.dueDate!, 'medium')}</p>}
        </div>
        {st.debt.note && <p className="px-1 text-sm">{st.debt.note}</p>}
        <h3 className="section-title">{t('debts.movements')}</h3>
        <div className="card divide-y divide-line">
          {!st.debt.walletId && (
            <div className="flex items-center gap-3 px-4 py-3 text-sm">
              <span className="flex-1">{t('debts.principalNoWallet')} · {fmt.date(st.debt.date, 'medium')}</span>
              <span className="num font-semibold">{fmt.money(st.debt.amount)}</span>
            </div>
          )}
          {movements.map((m) => {
            const principal = m.id === st.debt.principalTxId;
            return (
              <div key={m.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{principal ? (mine ? t('debts.lent') : t('debts.borrowed')) : t('debts.repayment')}</span>
                  <span className="block text-muted">{walletName(m.walletId)} · {fmt.date(m.date, 'medium')}{m.note ? ` · ${m.note}` : ''}</span>
                </span>
                <span className={`num font-semibold ${m.flow === 'in' ? 'text-income' : 'text-expense'}`}>{fmt.money(m.flow === 'in' ? m.amount : -m.amount, { sign: true })}</span>
                {!principal && (
                  <button className="p-2 text-muted" aria-label={t('common.delete')} onClick={async () => {
                    const { undo } = await deleteTransaction(m.id);
                    toast({ message: t('debts.paymentDeleted'), undo });
                  }}><Trash2 className="size-4" /></button>
                )}
              </div>
            );
          })}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-soft" onClick={() => onEdit(st.debt)}><Pencil className="size-4" />{t('common.edit')}</button>
          <button className="btn-danger" onClick={async () => {
            if (!confirm(t('debts.deleteConfirm'))) return;
            const { undo } = await removeDebt(st.debt.id);
            onClose();
            toast({ message: t('debts.deleted'), undo });
          }}><Trash2 className="size-4" />{t('common.delete')}</button>
        </div>
      </div>
      {pay && <PaymentForm st={st} onClose={() => setPay(false)} />}
    </Sheet>
  );
}

function PaymentForm({ st, onClose }: { st: DebtStatus; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const fmt = useFmt();
  const wallets = useWallets() ?? [];
  const [amount, setAmount] = useState(minorToKeypad(st.remaining));
  const [walletId, setWalletId] = useState<ID | undefined>(st.debt.walletId ?? wallets.find((w) => !w.archived)?.id);
  const [date, setDate] = useState(toDay(Date.now()));
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    try {
      const { undo } = await addRepayment(st.debt.id, { amount: parseAmount(amount) ?? 0, walletId: walletId ?? '', date: fromDay(date) + 12 * 3600e3, note });
      toast({ message: t('debts.paymentSaved'), undo });
      onClose();
    } catch (e) {
      setError(errorMessage(e, t));
    }
  };
  return (
    <Sheet open onClose={onClose} title={st.debt.direction === 'owed_to_me' ? t('debts.receivePayment') : t('debts.makePayment')}
      footer={<div className="space-y-2">{error && <p className="text-sm text-expense">{error}</p>}<button className="btn-primary w-full" onClick={save}>{t('common.save')}</button></div>}>
      <div className="space-y-4">
        <div>
          <label className="label" htmlFor="pamount">{t('tx.amount')} ({fmt.currencyLabel})</label>
          <input id="pamount" className="input num text-lg" dir="ltr" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <p className="num mt-1 text-xs text-muted">{t('debts.remaining')}: {fmt.money(st.remaining)}</p>
        </div>
        <div><span className="label">{t('tx.wallet')}</span><WalletChips wallets={wallets} value={walletId} onChange={setWalletId} /></div>
        <div><span className="label">{t('tx.dateTime')}</span><DateField label={t('tx.dateTime')} value={date} onChange={(v) => v && setDate(v)} /></div>
        <div><label className="label" htmlFor="pnote">{t('tx.note')}</label><input id="pnote" className="input" value={note} onChange={(e) => setNote(e.target.value)} /></div>
      </div>
    </Sheet>
  );
}

function DebtForm({ debt, direction, onClose }: { debt?: Debt; direction: DebtDirection; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const fmt = useFmt();
  const wallets = useWallets() ?? [];
  const [dir, setDir] = useState<DebtDirection>(debt?.direction ?? direction);
  const [person, setPerson] = useState(debt?.person ?? '');
  const [amount, setAmount] = useState(debt ? minorToKeypad(debt.amount) : '');
  const [date, setDate] = useState(toDay(debt?.date ?? Date.now()));
  const [due, setDue] = useState(debt?.dueDate != null ? toDay(debt.dueDate) : '');
  const [note, setNote] = useState(debt?.note ?? '');
  const [moveMoney, setMoveMoney] = useState(debt ? debt.walletId != null : true);
  const [walletId, setWalletId] = useState<ID | undefined>(debt?.walletId ?? wallets.find((w) => !w.archived)?.id);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const input = {
      direction: dir, person, amount: parseAmount(amount) ?? 0, date: fromDay(date) + 12 * 3600e3,
      dueDate: due ? fromDay(due) + 23 * 3600e3 : null, note, walletId: moveMoney ? walletId ?? null : null,
    };
    try {
      if (debt) {
        await updateDebt(debt.id, input);
        toast({ message: t('debts.updated') });
      } else {
        const { undo } = await createDebt(input);
        toast({ message: t('debts.saved'), undo });
      }
      onClose();
    } catch (e) {
      setError(errorMessage(e, t));
    }
  };

  return (
    <Sheet open onClose={onClose} title={debt ? t('debts.edit') : dir === 'owed_to_me' ? t('debts.lend') : t('debts.borrow')}
      footer={<div className="space-y-2">{error && <p className="text-sm text-expense">{error}</p>}<button className="btn-primary w-full" onClick={save}>{t('common.save')}</button></div>}>
      <div className="space-y-4">
        <Segmented<DebtDirection> value={dir} onChange={setDir}
          options={[{ value: 'owed_to_me', label: t('debts.owesMeShort') }, { value: 'i_owe', label: t('debts.iOweShort') }]} />
        <div>
          <label className="label" htmlFor="dperson">{t('debts.person')}</label>
          <input id="dperson" className="input" value={person} onChange={(e) => setPerson(e.target.value)} autoFocus={!debt} />
        </div>
        <div>
          <label className="label" htmlFor="damount">{t('tx.amount')} ({fmt.currencyLabel})</label>
          <input id="damount" className="input num text-lg" dir="ltr" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div><span className="label">{t('debts.date')}</span><DateField label={t('debts.date')} value={date} onChange={(v) => v && setDate(v)} /></div>
          <div><span className="label">{t('debts.dueDate')}</span><DateField clearable label={t('debts.dueDate')} placeholder={t('common.optional')} value={due} onChange={setDue} /></div>
        </div>
        <div className="card p-3">
          <div className="flex items-center gap-3">
            <span className="flex-1 text-sm font-semibold">{dir === 'owed_to_me' ? t('debts.moveOut') : t('debts.moveIn')}</span>
            <Toggle checked={moveMoney} onChange={setMoveMoney} />
          </div>
          {moveMoney ? <div className="mt-2"><WalletChips wallets={wallets} value={walletId} onChange={setWalletId} /></div>
            : <p className="mt-1 text-xs text-muted">{t('debts.noWalletHint')}</p>}
        </div>
        <div>
          <label className="label" htmlFor="dnote">{t('tx.note')}</label>
          <input id="dnote" className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <p className="text-xs text-muted">{t('debts.notIncomeHint')}</p>
      </div>
    </Sheet>
  );
}
