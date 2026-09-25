import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Camera, ChevronDown, ImageOff, ImagePlus, Plus, SplitSquareHorizontal, Trash2 } from 'lucide-react';
import type { ID, Split, Transaction, TxType } from '../data/types';

/** The editor handles everyday entries; debt movements are managed from the debts page. */
export type EditType = Exclude<TxType, 'debt'>;
import { Sheet, Segmented } from './ui';
import { AmountPad, formatBuffer } from './AmountPad';
import { CategoryGrid, CategorySelect, WalletPicker } from './pickers';
import { TagInput } from './TagInput';
import { DateTimeField } from './DatePicker';
import { useToast } from './Toast';
import { useWallets } from '../hooks/data';
import { useLang, useSettings } from '../hooks/settings';
import { useFmt } from '../hooks/fmt';
import { keypadToMinor, minorToKeypad, parseAmount } from '../lib/money';
import { createTransaction, feeOf, updateTransaction, type TxInput } from '../repo/transactions';
import { getReceipt, saveReceipt } from '../repo/receipts';
import { compressImage } from '../services/image';
import { isNative, native } from '../platform';
import { parseRate, rateToString, toBase } from '../services/currency';
import { setSettings } from '../repo/settings';
import { checkBudgetAlerts } from '../repo/budgets';
import { useNames } from '../hooks/data';
import { errorMessage } from '../services/errors';

interface SplitRow { categoryId: ID | ''; amount: string }

/** A draft (from "اكتب يومك") shown in the editor like a transaction, without being one yet. */
function draftAsTx(d: TxInput): Transaction {
  const splits = d.splits?.length ? d.splits : d.categoryId ? [{ categoryId: d.categoryId, amount: d.amount }] : [];
  return {
    id: '', type: d.type, amount: d.amount, walletId: d.walletId, toWalletId: d.toWalletId, splits, categoryIds: splits.map((x) => x.categoryId),
    date: d.date, note: d.note ?? '', tags: d.tags ?? [], origCurrency: d.origCurrency, origAmount: d.origAmount, rateE4: d.rateE4,
    currency: '', createdAt: 0, updatedAt: 0, deletedAt: null,
  };
}

/**
 * `draft` + `onDraft`: edits an entry that is not saved yet ("اكتب يومك"): the result goes back
 * to `onDraft` instead of the database, and there is no receipt photo.
 */
export default function TxSheet({ initialType, tx: realTx, onClose, draft, onDraft }: {
  initialType: EditType; tx?: Transaction; onClose: () => void; draft?: TxInput; onDraft?: (input: TxInput) => void;
}) {
  const tx = realTx ?? (draft ? draftAsTx(draft) : undefined);
  const { t } = useTranslation();
  const lang = useLang();
  const fmt = useFmt();
  const settings = useSettings();
  const toast = useToast();
  const wallets = useWallets() ?? [];
  const editing = !!tx;

  const [type, setType] = useState<EditType>(initialType);
  const [buf, setBuf] = useState(tx ? minorToKeypad(tx.origCurrency ? tx.origAmount ?? 0 : tx.amount) : '');
  // Currency of the typed amount: base, or a foreign one converted with a manual rate.
  const [currency, setCurrency] = useState(tx?.origCurrency ?? settings.currency);
  const [rateStr, setRateStr] = useState(tx?.rateE4 ? rateToString(tx.rateE4) : '');
  const [step, setStep] = useState<'amount' | 'details'>(tx && (realTx || tx.amount > 0 || tx.origAmount) ? 'details' : 'amount');
  const [walletId, setWalletId] = useState<ID | undefined>(tx?.walletId);
  const [toWalletId, setToWalletId] = useState<ID | undefined>(tx?.toWalletId);
  const [categoryId, setCategoryId] = useState<ID | undefined>(tx && tx.splits.length === 1 ? tx.splits[0].categoryId : undefined);
  const [splitMode, setSplitMode] = useState(!!tx && tx.splits.length > 1);
  const [splits, setSplits] = useState<SplitRow[]>(
    tx && tx.splits.length > 1 ? tx.splits.map((s) => ({ categoryId: s.categoryId, amount: minorToKeypad(s.amount) })) : [],
  );
  const [date, setDate] = useState<number>(tx?.date ?? Date.now());
  const [note, setNote] = useState(tx?.note ?? '');
  const [tags, setTags] = useState<string[]>(tx?.tags ?? []);
  const [fee, setFee] = useState('');
  const [receiptId, setReceiptId] = useState<ID | undefined>(tx?.receiptId);
  const [receiptBlob, setReceiptBlob] = useState<Blob | null>(null);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [more, setMore] = useState(editing);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const keyed = keypadToMinor(buf);
  const foreign = currency !== settings.currency && type !== 'transfer';
  const rateE4 = foreign ? parseRate(rateStr) : null;
  /** Always in base currency. */
  const amount = foreign ? (rateE4 ? toBase(keyed, rateE4) : 0) : keyed;
  const { categoryName } = useNames();
  const pickCurrency = (c: string) => {
    setCurrency(c);
    const last = settings.lastRates[c];
    setRateStr(last ? rateToString(last) : '');
    if (c !== settings.currency) setSplitMode(false);
  };
  const active = wallets.filter((w) => !w.archived);

  // No wallet is preselected for a new entry: choosing it is mandatory (a wrong default was easy to
  // miss). A wallet that no longer exists or is archived counts as not chosen.
  const walletOk = !!walletId && active.some((w) => w.id === walletId);
  const walletsOk = walletOk && (type !== 'transfer' || (!!toWalletId && toWalletId !== walletId && active.some((w) => w.id === toWalletId)));

  // existing transfer fee and receipt preview
  useEffect(() => {
    if (realTx?.type === 'transfer') void feeOf(realTx).then((f) => f && setFee(minorToKeypad(f)));
  }, [realTx]);
  useEffect(() => {
    let url: string | null = null;
    (async () => {
      const blob = receiptBlob ?? (receiptId ? (await getReceipt(receiptId))?.blob : null);
      if (blob) setReceiptUrl((url = URL.createObjectURL(blob)));
      else setReceiptUrl(null);
    })();
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [receiptId, receiptBlob]);

  const splitSum = splits.reduce((a, s) => a + (parseAmount(s.amount) ?? 0), 0);

  const save = useCallback(async (pickedCategory?: ID, pickedWallet?: ID) => {
    setError(null);
    const wid = pickedWallet ?? walletId;
    if (!wid || !active.some((w) => w.id === wid)) { setError(t('tx.chooseWallet')); return; }
    const input: TxInput = {
      type, amount, walletId: wid, date, note, tags,
      receiptId: receiptId ?? null,
    };
    if (foreign) {
      if (!rateE4) { setError(t('errors.rate')); return; }
      Object.assign(input, { origCurrency: currency, origAmount: keyed, rateE4 });
    }
    if (type === 'transfer') {
      input.toWalletId = toWalletId;
      input.fee = fee ? parseAmount(fee) ?? -1 : 0;
    } else if (splitMode) {
      input.splits = splits.map<Split>((s) => ({ categoryId: s.categoryId, amount: parseAmount(s.amount) ?? 0 }));
    } else {
      input.categoryId = pickedCategory ?? categoryId;
    }
    if (onDraft) {
      // "اكتب يومك": validated when everything is saved together
      if (input.amount <= 0) { setError(t('errors.amount')); return; }
      onDraft(input);
      onClose();
      return;
    }
    setBusy(true);
    try {
      if (receiptBlob) input.receiptId = await saveReceipt(receiptBlob);
      if (realTx) {
        const { undo } = await updateTransaction(realTx.id, input);
        toast({ message: t('tx.updated'), undo });
      } else {
        const { undo } = await createTransaction(input);
        toast({ message: t(`tx.saved_${type}`, { amount: fmt.money(amount) }), undo });
      }
      if (foreign && rateE4) void setSettings({ lastRates: { ...settings.lastRates, [currency]: rateE4 } });
      if (type === 'expense') {
        // Budget alerts (80% / 100%) are shown right after the expense that crosses them.
        const fresh = await checkBudgetAlerts();
        const top = fresh.sort((a, b) => b.level - a.level)[0];
        if (top) toast({ message: t(top.level >= 100 ? 'budgets.alert100' : 'budgets.alert80', { name: categoryName(top.budget.categoryId) }), tone: top.level >= 100 ? 'error' : 'default', duration: 6000 });
      }
      onClose();
    } catch (e) {
      setError(errorMessage(e, t));
    } finally {
      setBusy(false);
    }
  }, [type, amount, walletId, toWalletId, date, note, tags, receiptId, receiptBlob, fee, splitMode, splits, categoryId, realTx, onDraft, toast, t, fmt, onClose, foreign, rateE4, currency, keyed, settings.lastRates, categoryName, active]);

  // Quick entry: amount → wallet + category (either order) → saved on the second tap.
  const quick = !editing && !more;
  const onPickCategory = (id: ID) => {
    setCategoryId(id);
    if (quick && amount > 0 && walletOk) void save(id);
  };
  const onPickWallet = (id: ID | null) => {
    if (!id) return;
    setWalletId(id);
    setError(null);
    if (quick && type !== 'transfer' && amount > 0 && categoryId && !splitMode) void save(categoryId, id);
  };

  const typeTabs = (
    <Segmented<EditType>
      value={type}
      onChange={(v) => { setType(v); setCategoryId(undefined); setSplitMode(false); }}
      options={[
        { value: 'expense', label: t('types.expense') },
        { value: 'income', label: t('types.income') },
        { value: 'transfer', label: t('types.transfer') },
      ]}
    />
  );

  const amountColor = type === 'income' ? 'text-income' : type === 'expense' ? 'text-expense' : 'text-transfer';
  const currencies = [settings.currency, ...settings.currencies.map((c) => c.code)];
  const amountDisplay = (
    <div>
      <button type="button" onClick={() => setStep('amount')} className="w-full py-3 text-center" aria-label={t('tx.amount')}>
        <span className={`num text-4xl font-bold ${amountColor}`} dir="ltr">{formatBuffer(buf, lang)}</span>
        <span className="ms-2 text-lg text-muted">{foreign ? currency : fmt.currencyLabel}</span>
      </button>
      {type !== 'transfer' && currencies.length > 1 && (
        <div className="no-scrollbar flex justify-center gap-1.5 overflow-x-auto pb-1" dir="ltr">
          {currencies.map((c) => (
            <button key={c} type="button" onClick={() => pickCurrency(c)} className={`chip min-h-8 px-2.5 text-xs font-bold ${c === (foreign ? currency : settings.currency) ? 'chip-on' : ''}`}>{c}</button>
          ))}
        </div>
      )}
      {foreign && (
        <div className="mt-2 flex items-center justify-center gap-2 text-sm">
          <span className="num" dir="ltr">1 {currency} =</span>
          <input className="input num min-h-10 w-24 text-center" dir="ltr" inputMode="decimal" value={rateStr} placeholder="0" aria-label={t('currencies.rate')} onChange={(e) => setRateStr(e.target.value)} />
          <span>{fmt.currencyLabel}</span>
          <span className="num font-semibold text-muted">= {rateE4 ? fmt.money(amount) : '…'}</span>
        </div>
      )}
    </div>
  );

  if (step === 'amount') {
    return (
      <Sheet open onClose={onClose} title={editing ? t('tx.edit') : t('tx.new')}
        footer={
          <button className="btn-primary w-full text-lg" disabled={amount <= 0} onClick={() => setStep('details')}>
            {t('common.next')}
          </button>
        }>
        <div className="space-y-3">
          {typeTabs}
          {amountDisplay}
          <AmountPad value={buf} onChange={setBuf} onEnter={() => amount > 0 && setStep('details')} />
        </div>
      </Sheet>
    );
  }

  const quickHint = !editing && !more && type !== 'transfer';

  return (
    <Sheet open onClose={onClose} tall title={editing ? t('tx.edit') : t('tx.new')}
      footer={
        <div className="space-y-2">
          {error && <p className="text-sm font-medium text-expense" role="alert">{error}</p>}
          {!quickHint && (
            <button className="btn-primary w-full text-lg" disabled={busy || amount <= 0 || !walletsOk} onClick={() => save()}>
              {t('common.save')}
            </button>
          )}
          {quickHint && <p className="text-center text-sm text-muted">{t('tx.pickWalletAndCategory')}</p>}
        </div>
      }>
      <div className="space-y-4">
        {typeTabs}
        {amountDisplay}

        <div>
          <span className="label">{type === 'transfer' ? t('tx.fromWallet') : t('tx.wallet')}{!walletOk && <span className="text-amber-700 dark:text-amber-300"> — {t('tx.chooseWallet')}</span>}</span>
          <WalletPicker wallets={wallets} value={walletOk ? walletId : undefined} onChange={onPickWallet} invalid={!walletOk && !!error} />
        </div>

        {type === 'transfer' ? (
          <>
            <div>
              <span className="label">{t('tx.toWallet')}</span>
              <WalletPicker wallets={wallets} value={toWalletId} onChange={(id) => id && setToWalletId(id)} exclude={walletId} />
            </div>
            <div>
              <label className="label" htmlFor="fee">{t('tx.fee')}</label>
              <input id="fee" className="input num" inputMode="decimal" dir="ltr" value={fee} placeholder="0"
                onChange={(e) => setFee(e.target.value)} />
              <p className="mt-1 text-xs text-muted">{t('tx.feeHint')}</p>
            </div>
          </>
        ) : splitMode ? (
          <div className="card space-y-2 p-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold">{t('tx.split')}</span>
              <span className={`num text-sm ${splitSum === amount ? 'text-income' : 'text-expense'}`}>
                {t('tx.remaining')}: {fmt.money(amount - splitSum)}
              </span>
            </div>
            {splits.map((s, i) => (
              <div key={i} className="flex gap-2">
                <div className="flex-1">
                  <CategorySelect kind={type} value={s.categoryId}
                    onChange={(id) => setSplits(splits.map((x, j) => (j === i ? { ...x, categoryId: id } : x)))} />
                </div>
                <input className="input num w-28" inputMode="decimal" dir="ltr" value={s.amount}
                  onChange={(e) => setSplits(splits.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
                <button type="button" className="btn-ghost w-11 px-0" aria-label={t('common.remove')}
                  onClick={() => setSplits(splits.filter((_, j) => j !== i))}>
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
            <div className="flex gap-2">
              <button type="button" className="btn-soft flex-1" onClick={() => setSplits([...splits, {
                categoryId: '', amount: amount - splitSum > 0 ? minorToKeypad(amount - splitSum) : '',
              }])}>
                <Plus className="size-4" /> {t('tx.addPart')}
              </button>
              <button type="button" className="btn-ghost" onClick={() => { setSplitMode(false); setSplits([]); }}>
                {t('tx.cancelSplit')}
              </button>
            </div>
          </div>
        ) : (
          <div>
            <span className="label">{t('tx.category')}</span>
            <CategoryGrid kind={type} value={categoryId} onPick={onPickCategory} />
          </div>
        )}

        <button type="button" className="btn-ghost w-full justify-between" onClick={() => setMore(!more)} aria-expanded={more}>
          {t('tx.moreDetails')}
          <ChevronDown className={`size-5 transition ${more ? 'rotate-180' : ''}`} />
        </button>

        {more && (
          <div className="space-y-4">
            <div>
              <label className="label" htmlFor="note">{t('tx.note')}</label>
              <input id="note" className="input" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <div>
              <span className="label">{t('tx.dateTime')}</span>
              <DateTimeField value={date} onChange={setDate} label={t('tx.dateTime')} />
            </div>
            <div>
              <span className="label">{t('tx.tags')}</span>
              <TagInput value={tags} onChange={setTags} />
            </div>
            {type !== 'transfer' && !splitMode && !foreign && (
              <button type="button" className="btn-soft w-full" onClick={() => {
                setSplitMode(true);
                setSplits(categoryId ? [{ categoryId, amount: minorToKeypad(amount) }, { categoryId: '', amount: '' }] : [{ categoryId: '', amount: minorToKeypad(amount) }]);
              }}>
                <SplitSquareHorizontal className="size-4" /> {t('tx.splitAction')}
              </button>
            )}
            <div className={onDraft ? 'hidden' : undefined}>
              <span className="label">{t('tx.receipt')}</span>
              {receiptUrl ? (
                <div className="flex items-center gap-3">
                  <img src={receiptUrl} alt="" className="size-20 rounded-xl object-cover ring-1 ring-line" />
                  <button type="button" className="btn-danger" onClick={() => { setReceiptBlob(null); setReceiptId(undefined); }}>
                    <ImageOff className="size-4" /> {t('common.remove')}
                  </button>
                </div>
              ) : (
                // Two explicit choices: `capture` forces the camera, so the gallery input must not have it.
                // Android app: the native camera and photo picker instead.
                <div className="grid grid-cols-2 gap-2">
                  {isNative && (['camera', 'gallery'] as const).map((kind) => (
                    <button key={kind} type="button" className="btn-soft" onClick={async () => {
                      try {
                        const photo = await (await native()).pickPhoto(kind);
                        if (photo) setReceiptBlob(await compressImage(photo));
                      } catch (err) {
                        setError(errorMessage(err, t, 'receipt:native'));
                      }
                    }}>
                      {kind === 'camera' ? <Camera className="size-4" /> : <ImagePlus className="size-4" />}
                      {t(kind === 'camera' ? 'tx.takePhoto' : 'tx.fromGallery')}
                    </button>
                  ))}
                  {!isNative && ([['camera', true], ['gallery', false]] as const).map(([kind, capture]) => (
                    <label key={kind} className="btn-soft cursor-pointer">
                      {kind === 'camera' ? <Camera className="size-4" /> : <ImagePlus className="size-4" />}
                      {t(kind === 'camera' ? 'tx.takePhoto' : 'tx.fromGallery')}
                      <input type="file" accept="image/*" {...(capture ? { capture: 'environment' as const } : {})} className="hidden"
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          e.target.value = '';
                          if (!f) return;
                          try {
                            setReceiptBlob(await compressImage(f)); // gallery photos are compressed exactly like camera ones
                          } catch (err) {
                            setError(errorMessage(err, t, 'receipt'));
                          }
                        }} />
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}
