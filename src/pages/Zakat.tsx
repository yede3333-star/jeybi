import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { CheckCircle2, Info, Moon } from 'lucide-react';
import type { ID } from '../data/types';
import { PageHeader, Segmented, Sheet, Toggle } from '../components/ui';
import { DateField } from '../components/DatePicker';
import { WalletChips } from '../components/pickers';
import { useToast } from '../components/Toast';
import { useNames } from '../hooks/data';
import { useFmt } from '../hooks/fmt';
import { useLang } from '../hooks/settings';
import { recordZakatPayment, updateZakatSettings, zakatSnapshot } from '../repo/zakat';
import { formatHijri, NISAB_GRAMS } from '../services/zakat';
import { minorToKeypad, parseAmount } from '../lib/money';
import { fromDay, toDay } from '../lib/periodParams';

export default function Zakat() {
  const { t } = useTranslation();
  const fmt = useFmt();
  const lang = useLang();
  const { nameOf } = useNames();
  const snap = useLiveQuery(() => zakatSnapshot(), []);
  const [pay, setPay] = useState(false);
  if (!snap) return <PageHeader back title={t('zakat.title')} />;
  const { settings: z, result: r, hawl } = snap;
  const price = z.basis === 'gold' ? z.gramPriceGold : z.gramPriceSilver;
  const counted = new Set(snap.counted.map((w) => w.id));

  return (
    <div>
      <PageHeader back title={t('zakat.title')} />
      <div className="space-y-3 px-4">
        <p className="flex gap-2 rounded-xl bg-amber-100 p-3 text-sm text-amber-950 dark:bg-amber-400/15 dark:text-amber-200">
          <Info className="size-5 shrink-0" />{t('zakat.disclaimer')}
        </p>

        <section className="card space-y-3 p-4">
          <h2 className="font-bold">{t('zakat.nisab')}</h2>
          <Segmented<'gold' | 'silver'> value={z.basis} onChange={(basis) => updateZakatSettings({ basis })}
            options={[{ value: 'gold', label: t('zakat.gold', { g: NISAB_GRAMS.gold }) }, { value: 'silver', label: t('zakat.silver', { g: NISAB_GRAMS.silver }) }]} />
          <PriceField key={z.basis} label={t('zakat.gramPrice', { metal: z.basis === 'gold' ? t('zakat.goldName') : t('zakat.silverName') })} value={price}
            onSave={(v) => updateZakatSettings(z.basis === 'gold' ? { gramPriceGold: v } : { gramPriceSilver: v })} />
        </section>

        <section className="card space-y-3 p-4">
          <h2 className="font-bold">{t('zakat.whatCounts')}</h2>
          <div className="flex flex-wrap gap-2">
            {snap.wallets.filter((w) => !w.archived).map((w) => (
              <button key={w.id} className={`chip ${counted.has(w.id) ? 'chip-on' : ''}`} onClick={() => {
                const next = counted.has(w.id) ? [...counted].filter((x) => x !== w.id) : [...counted, w.id];
                void updateZakatSettings({ walletIds: next });
              }}>{nameOf(w)}</button>
            ))}
          </div>
          <label className="flex items-center gap-3 text-sm"><span className="flex-1">{t('zakat.includeReceivables')}</span>
            <Toggle checked={z.includeReceivables} onChange={(v) => updateZakatSettings({ includeReceivables: v })} /></label>
          <label className="flex items-center gap-3 text-sm"><span className="flex-1">{t('zakat.subtractPayables')}</span>
            <Toggle checked={z.subtractPayables} onChange={(v) => updateZakatSettings({ subtractPayables: v })} /></label>
        </section>

        <section className="card p-4">
          <h2 className="mb-2 font-bold">{t('zakat.steps')}</h2>
          <ol className="space-y-2 text-sm">
            <Step n={1} label={t('zakat.stepCash')} value={fmt.money(r.cash)} />
            {z.includeReceivables && <Step n={2} label={t('zakat.stepReceivables')} value={`+ ${fmt.money(r.receivables)}`} />}
            {z.subtractPayables && <Step n={3} label={t('zakat.stepPayables')} value={`− ${fmt.money(r.payables)}`} />}
            <Step n={4} label={t('zakat.stepTotal')} value={fmt.money(r.total)} strong />
            <Step n={5} label={t('zakat.stepNisab', { g: NISAB_GRAMS[z.basis], price: fmt.money(price) })} value={price ? fmt.money(r.nisab) : '—'} />
            <Step n={6} label={price ? (r.reached ? t('zakat.reached') : t('zakat.notReached')) : t('zakat.enterPrice')} value="" />
            {r.reached && <Step n={7} label={t('zakat.stepDue', { total: fmt.money(r.total) })} value={fmt.money(r.due)} strong />}
          </ol>
        </section>

        <section className="card space-y-3 p-4">
          <h2 className="flex items-center gap-2 font-bold"><Moon className="size-4" />{t('zakat.hawl')}</h2>
          <p className="text-sm text-muted">{t('zakat.hawlHint')}</p>
          <span className="label">{t('zakat.hawlStart')}</span>
          <DateField clearable label={t('zakat.hawlStart')} placeholder={t('zakat.hawlStartPlaceholder')} value={z.hawlStart ? toDay(z.hawlStart) : ''}
            onChange={(v) => updateZakatSettings({ hawlStart: v ? fromDay(v) : null })} />
          {hawl && (
            <div className="space-y-1 text-sm">
              <p>{t('zakat.startedOn')}: <b>{formatHijri(hawl.start, lang)}</b> <span className="num text-muted">({fmt.date(hawl.start, 'medium')})</span></p>
              <p>{t('zakat.endsOn')}: <b>{formatHijri(hawl.end, lang)}</b> <span className="num text-muted">({fmt.date(hawl.end, 'medium')})</span></p>
              <p className={`font-semibold ${hawl.complete ? 'text-expense' : 'text-muted'}`}>{hawl.complete ? t('zakat.hawlComplete') : t('zakat.daysLeft', { n: hawl.daysLeft })}</p>
            </div>
          )}
          {z.lastPaidAt && <p className="flex items-center gap-1 text-sm text-income"><CheckCircle2 className="size-4" />{t('zakat.lastPaid', { date: fmt.date(z.lastPaidAt, 'medium') })}</p>}
        </section>

        <button className="btn-primary w-full" disabled={!r.reached} onClick={() => setPay(true)}>{t('zakat.record')}</button>
      </div>
      {pay && <PaySheet due={r.due} onClose={() => setPay(false)} />}
    </div>
  );
}

function Step({ n, label, value, strong = false }: { n: number; label: string; value: string; strong?: boolean }) {
  return (
    <li className={`flex items-start gap-2 ${strong ? 'font-bold' : ''}`}>
      <span className="num inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-teal-700/10 text-xs text-teal-800 dark:text-teal-300">{n}</span>
      <span className="flex-1">{label}</span>
      <span className="num">{value}</span>
    </li>
  );
}

function PriceField({ label, value, onSave }: { label: string; value: number; onSave: (v: number) => void }) {
  const [s, setS] = useState(value ? minorToKeypad(value) : '');
  return (
    <div>
      <label className="label" htmlFor="gram">{label}</label>
      <input id="gram" className="input num" dir="ltr" inputMode="decimal" value={s} placeholder="0"
        onChange={(e) => setS(e.target.value)} onBlur={() => onSave(parseAmount(s) ?? 0)} />
    </div>
  );
}

function PaySheet({ due, onClose }: { due: number; onClose: () => void }) {
  const { t } = useTranslation();
  const fmt = useFmt();
  const lang = useLang();
  const toast = useToast();
  const { wallets } = useNames();
  const [amount, setAmount] = useState(minorToKeypad(due));
  const [walletId, setWalletId] = useState<ID | undefined>(wallets?.find((w) => !w.archived)?.id);
  const save = async () => {
    const v = parseAmount(amount) ?? 0;
    if (!v || !walletId) return;
    const { undo } = await recordZakatPayment(walletId, v, `${t('sys.zakat')} ${formatHijri(Date.now(), lang)}`);
    toast({ message: t('zakat.recorded'), undo });
    onClose();
  };
  return (
    <Sheet open onClose={onClose} title={t('zakat.record')} footer={<button className="btn-primary w-full" onClick={save}>{t('common.save')}</button>}>
      <div className="space-y-4">
        <div><label className="label" htmlFor="zamount">{t('tx.amount')} ({fmt.currencyLabel})</label>
          <input id="zamount" className="input num text-lg" dir="ltr" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
        <div><span className="label">{t('tx.wallet')}</span><WalletChips wallets={wallets ?? []} value={walletId} onChange={setWalletId} /></div>
        <p className="text-xs text-muted">{t('zakat.recordHint')}</p>
      </div>
    </Sheet>
  );
}
