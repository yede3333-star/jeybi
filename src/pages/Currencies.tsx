import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Lock, Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '../components/ui';
import { useSettings } from '../hooks/settings';
import { useFmt } from '../hooks/fmt';
import { setSettings } from '../repo/settings';
import { normalizeCurrencyCode, parseRate, rateToString } from '../services/currency';

export default function Currencies() {
  const { t } = useTranslation();
  const s = useSettings();
  const fmt = useFmt();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const c = normalizeCurrencyCode(code);
  const exists = c === s.currency || s.currencies.some((x) => x.code === c);

  const add = async () => {
    if (c.length !== 3 || exists) return;
    await setSettings({ currencies: [...s.currencies, { code: c, name: name.trim() || c }] });
    setCode('');
    setName('');
  };

  return (
    <div>
      <PageHeader back title={t('currencies.title')} />
      <div className="space-y-3 px-4">
        <div className="card flex items-center gap-3 p-4">
          <Lock className="size-5 text-muted" />
          <div className="flex-1">
            <p className="font-semibold">{t('currencies.base')}: {s.currency} ({fmt.currencyLabel})</p>
            <p className="text-sm text-muted">{t('currencies.baseHint')}</p>
          </div>
        </div>
        <h2 className="section-title">{t('currencies.others')}</h2>
        <div className="card divide-y divide-line overflow-hidden">
          {s.currencies.map((x) => (
            <div key={x.code} className="flex min-h-14 items-center gap-3 px-4">
              <span className="num w-12 font-bold">{x.code}</span>
              <span className="flex-1">{x.name}</span>
              <RateEditor code={x.code} />
              <button className="p-2 text-muted" aria-label={t('common.remove')}
                onClick={() => setSettings({ currencies: s.currencies.filter((y) => y.code !== x.code) })}><Trash2 className="size-4" /></button>
            </div>
          ))}
        </div>
        <div className="card space-y-2 p-4">
          <p className="font-semibold">{t('currencies.add')}</p>
          <div className="grid grid-cols-3 gap-2">
            <input className="input num uppercase" dir="ltr" maxLength={3} placeholder="SAR" value={code} onChange={(e) => setCode(e.target.value)} aria-label={t('currencies.code')} />
            <input className="input col-span-2" placeholder={t('currencies.name')} value={name} onChange={(e) => setName(e.target.value)} aria-label={t('currencies.name')} />
          </div>
          {exists && c && <p className="text-sm text-expense">{t('currencies.exists')}</p>}
          <button className="btn-soft w-full" disabled={c.length !== 3 || exists} onClick={add}><Plus className="size-4" />{t('common.add')}</button>
        </div>
        <p className="px-1 text-xs text-muted">{t('currencies.rateHint', { base: s.currency })}</p>
      </div>
    </div>
  );
}

function RateEditor({ code }: { code: string }) {
  const { t } = useTranslation();
  const s = useSettings();
  const last = s.lastRates[code];
  const [v, setV] = useState(last ? rateToString(last) : '');
  return (
    <input className="input num w-24 text-center" dir="ltr" inputMode="decimal" placeholder={t('currencies.rate')} value={v} aria-label={t('currencies.rate')}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => { const r = parseRate(v); if (r) void setSettings({ lastRates: { ...s.lastRates, [code]: r } }); }} />
  );
}
