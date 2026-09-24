import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { Copy, History, Pencil, Trash2, Zap } from 'lucide-react';
import type { AuditEntry, FieldChange, Split, Transaction } from '../data/types';
import { PageHeader, Empty, Sheet } from '../components/ui';
import { IconBadge } from '../components/Icon';
import { useToast } from '../components/Toast';
import { useTxEditor } from '../components/TxEditor';
import { useNames } from '../hooks/data';
import { useFmt, type Formatters } from '../hooks/fmt';
import { createTransaction, deleteTransaction, feeOf, getTransaction } from '../repo/transactions';
import { historyOf } from '../repo/audit';
import { getReceipt } from '../repo/receipts';
import { saveTemplate, templateFromTx } from '../repo/templates';
import { formatNumber } from '../lib/money';
import { rateToString } from '../services/currency';

export default function TxDetail() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const fmt = useFmt();
  const nav = useNavigate();
  const toast = useToast();
  const { openEdit } = useTxEditor();
  const names = useNames();
  const tx = useLiveQuery(() => getTransaction(id), [id]);
  const history = useLiveQuery(() => historyOf(id), [id]);
  const fee = useLiveQuery(async () => (tx ? feeOf(tx) : 0), [tx]);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const [tplName, setTplName] = useState<string | null>(null);

  useEffect(() => {
    let url: string | null = null;
    if (tx?.receiptId) void getReceipt(tx.receiptId).then((r) => r && setReceiptUrl((url = URL.createObjectURL(r.blob))));
    else setReceiptUrl(null);
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [tx?.receiptId]);

  if (tx === undefined && history === undefined) return null;
  if (!tx) return <><PageHeader back title={t('tx.details')} /><Empty title={t('tx.notFound')} /></>;

  const color = tx.type === 'income' ? 'text-income' : tx.type === 'expense' ? 'text-expense' : 'text-transfer';
  const isDebt = tx.type === 'debt';
  const debt = names.debt(tx.debtId);
  const isPrincipal = !!debt && debt.principalTxId === tx.id;
  const signed = tx.type === 'expense' || (isDebt && tx.flow === 'out') ? -tx.amount : tx.amount;
  const del = async () => {
    const { undo } = await deleteTransaction(tx.id);
    toast({ message: t('tx.deleted'), undo });
    nav(-1);
  };
  const duplicate = async () => {
    const { tx: copy, undo } = await createTransaction({
      type: tx.type, amount: tx.amount, walletId: tx.walletId, toWalletId: tx.toWalletId, splits: tx.splits,
      date: Date.now(), note: tx.note, tags: tx.tags, fee: fee || 0,
      ...(tx.origCurrency ? { origCurrency: tx.origCurrency, origAmount: tx.origAmount, rateE4: tx.rateE4 } : {}),
    });
    toast({ message: t('tx.duplicated'), undo });
    nav(`/tx/${copy.id}`, { replace: true });
  };
  const makeTemplate = async () => {
    const data = templateFromTx(tx, tplName?.trim() || names.categoryName(tx.splits[0]?.categoryId));
    if (!data) return;
    await saveTemplate(data);
    setTplName(null);
    toast({ message: t('templates.created') });
  };

  return (
    <div>
      <PageHeader back title={t('tx.details')} actions={isDebt ? undefined :
        <button className="btn-ghost size-11 min-h-11 rounded-full p-0" onClick={() => openEdit(tx)} aria-label={t('common.edit')}>
          <Pencil className="size-5" />
        </button>
      } />
      <div className="space-y-3 px-4">
        <div className="card p-5 text-center">
          <p className="text-sm text-muted">{isDebt ? names.debtLabel(tx) : t(`types.${tx.type}`)}</p>
          <p className={`num mt-1 text-4xl font-extrabold ${color}`}>{fmt.money(signed, { sign: tx.type !== 'transfer' && tx.type !== 'expense' })}</p>
          <p className="mt-1 text-sm text-muted">{fmt.date(tx.date, 'long')} · <span className="num">{fmt.date(tx.date, 'time')}</span></p>
        </div>

        <div className="card divide-y divide-line">
          <Field label={tx.type === 'transfer' ? t('tx.fromWallet') : t('tx.wallet')} value={names.walletName(tx.walletId)} />
          {tx.type === 'transfer' && <Field label={t('tx.toWallet')} value={names.walletName(tx.toWalletId)} />}
          {tx.type === 'transfer' && !!fee && (
            <Field label={t('tx.fee')} value={<Link className="num text-teal-700 underline dark:text-teal-400" to={`/tx/${tx.feeTxId}`}>{fmt.money(fee)}</Link>} />
          )}
          {tx.transferId && <Field label={t('tx.feeOf')} value={<Link className="text-teal-700 underline dark:text-teal-400" to={`/tx/${tx.transferId}`}>{t('types.transfer')}</Link>} />}
          {tx.splits.map((s) => {
            const c = names.category(s.categoryId);
            return (
              <div key={s.categoryId} className="flex items-center gap-3 px-4 py-3">
                <IconBadge name={c?.icon ?? 'tag'} color={c?.color ?? '#94a3b8'} size="sm" />
                <span className="flex-1">{names.categoryName(s.categoryId, true)}</span>
                {tx.splits.length > 1 && <span className="num font-semibold">{fmt.money(s.amount)}</span>}
              </div>
            );
          })}
          {tx.origCurrency && (
            <Field label={t('currencies.original')} value={<span className="num">{formatNumber(tx.origAmount ?? 0, fmt.lang)} {tx.origCurrency} × {rateToString(tx.rateE4 ?? 0)}</span>} />
          )}
          {isDebt && <Field label={t('debts.title')} value={<Link className="text-teal-700 underline dark:text-teal-400" to="/debts">{debt?.person ?? '—'}</Link>} />}
          {tx.recurringKey && <Field label={t('recurring.title')} value={<Link className="text-teal-700 underline dark:text-teal-400" to="/recurring">{t('recurring.generated')}</Link>} />}
          {tx.note && <Field label={t('tx.note')} value={tx.note} />}
          {tx.tags.length > 0 && (
            <Field label={t('tx.tags')} value={
              <span className="flex flex-wrap justify-end gap-1">
                {tx.tags.map((tg) => <Link key={tg} to={`/transactions?tag=${encodeURIComponent(tg)}`} className="chip min-h-7">#{tg}</Link>)}
              </span>
            } />
          )}
        </div>

        {receiptUrl && (
          <button className="card block w-full overflow-hidden" onClick={() => setShowReceipt(true)}>
            <img src={receiptUrl} alt={t('tx.receipt')} className="max-h-60 w-full object-cover" />
          </button>
        )}

        {isDebt ? (
          !isPrincipal && <button className="btn-danger w-full" onClick={del}><Trash2 className="size-4" />{t('common.delete')}</button>
        ) : (
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-soft" onClick={duplicate}><Copy className="size-4" />{t('tx.duplicate')}</button>
          {tx.type !== 'transfer' ? (
            <button className="btn-soft" onClick={() => setTplName(names.categoryName(tx.splits[0]?.categoryId))}><Zap className="size-4" />{t('templates.fromTx')}</button>
          ) : <span />}
          <button className="btn-soft" onClick={() => openEdit(tx)}><Pencil className="size-4" />{t('common.edit')}</button>
          <button className="btn-danger" onClick={del}><Trash2 className="size-4" />{t('common.delete')}</button>
        </div>
        )}
        {isPrincipal && <p className="text-sm text-muted">{t('debts.managePrincipal')}</p>}

        <h2 className="section-title flex items-center gap-1"><History className="size-4" />{t('history.title')}</h2>
        <div className="card divide-y divide-line">
          {(history ?? []).map((h) => <HistoryItem key={h.seq} h={h} fmt={fmt} />)}
        </div>
      </div>

      <Sheet open={showReceipt} onClose={() => setShowReceipt(false)} title={t('tx.receipt')}>
        {receiptUrl && <img src={receiptUrl} alt="" className="w-full rounded-xl" />}
      </Sheet>
      <Sheet open={tplName !== null} onClose={() => setTplName(null)} title={t('templates.fromTx')}
        footer={<button className="btn-primary w-full" onClick={makeTemplate}>{t('common.save')}</button>}>
        <label className="label" htmlFor="tplname">{t('templates.name')}</label>
        <input id="tplname" className="input" value={tplName ?? ''} onChange={(e) => setTplName(e.target.value)} autoFocus />
      </Sheet>
    </div>
  );
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <span className="text-sm text-muted">{label}</span>
      <span className="text-end font-medium">{value}</span>
    </div>
  );
}

function HistoryItem({ h, fmt }: { h: AuditEntry; fmt: Formatters }) {
  const { t, i18n } = useTranslation();
  const names = useNames();
  const show = (c: FieldChange, v: unknown): string => {
    if (v == null || v === '') return '—';
    switch (c.field) {
      case 'amount': return fmt.money(v as number);
      case 'date': return fmt.date(v as number, 'dateTime');
      case 'walletId': case 'toWalletId': return names.walletName(v as string);
      case 'type': return t(`types.${v as Transaction['type']}`);
      case 'splits': return (v as Split[]).map((s) => `${names.categoryName(s.categoryId)} ${fmt.num(s.amount)}`).join(' + ') || '—';
      case 'tags': return (v as string[]).map((x) => `#${x}`).join(' ') || '—';
      case 'receiptId': return t('tx.receipt');
      default: return String(v);
    }
  };
  return (
    <div className="px-4 py-3">
      <div className="flex justify-between text-sm">
        <span className="font-semibold">{t(`history.${h.action}`)}</span>
        <span className="num text-muted">{fmt.date(h.at, 'dateTime')}</span>
      </div>
      {h.changes?.map((c, i) => (
        <p key={i} className="mt-1 text-sm">
          <span className="text-muted">{t(`history.fields.${c.field}`)}: </span>
          <span className="line-through opacity-60">{show(c, c.old)}</span>
          <span className="mx-1">{i18n.dir() === 'rtl' ? '←' : '→'}</span>
          <span className="font-medium">{show(c, c.new)}</span>
        </p>
      ))}
    </div>
  );
}
