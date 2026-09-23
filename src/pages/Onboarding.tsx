import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Languages, ShieldCheck, Wallet as WalletIcon } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { listWallets, setOpeningBalances } from '../repo/wallets';
import { setSettings } from '../repo/settings';
import { IconBadge } from '../components/Icon';
import { PinSetup } from './Security';
import { applyUi } from '../hooks/settings';
import { useSettings } from '../hooks/settings';
import { parseAmount, currencyLabel, type Lang } from '../lib/money';

/** First run: language → opening balances → optional PIN. */
export default function Onboarding() {
  const { t } = useTranslation();
  const s = useSettings();
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [lang, setLang] = useState<Lang>(s.lang ?? 'ar');
  const wallets = useLiveQuery(listWallets, []);
  const [balances, setBalances] = useState<Record<string, string>>({});

  const chooseLang = async (l: Lang) => {
    setLang(l);
    applyUi(l, s.theme, s.fontSize, matchMedia('(prefers-color-scheme: dark)').matches);
    await setSettings({ lang: l });
  };

  const finish = async () => {
    await setSettings({ onboarded: true, firstRunAt: s.firstRunAt || Date.now() });
  };

  const saveBalances = async () => {
    const values: Record<string, number> = {};
    for (const [id, v] of Object.entries(balances)) values[id] = parseAmount(v) ?? 0;
    await setOpeningBalances(values);
    setStep(2);
  };

  const Steps = (
    <div className="flex justify-center gap-2 py-4" aria-hidden>
      {[0, 1, 2].map((i) => <span key={i} className={`h-1.5 rounded-full transition-all ${i === step ? 'w-8 bg-teal-700' : 'w-3 bg-black/15 dark:bg-white/20'}`} />)}
    </div>
  );

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-8">
      {Steps}
      {step === 0 && (
        <div className="flex flex-1 flex-col">
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <img src="icons/icon-192.png" alt="" className="size-24 rounded-3xl shadow-lg" />
            <h1 className="text-3xl font-extrabold">جيبي · Jeybi</h1>
            <p className="text-muted">{t('onboarding.tagline')}</p>
            <p className="mt-4 flex items-center gap-2 font-semibold"><Languages className="size-5" />اختر اللغة · Choisissez la langue</p>
            <div className="grid w-full grid-cols-2 gap-3">
              {(['ar', 'fr'] as Lang[]).map((l) => (
                <button key={l} onClick={() => chooseLang(l)}
                  className={`card flex min-h-20 items-center justify-center gap-2 text-xl font-bold ${lang === l ? 'ring-2 ring-teal-600' : ''}`}>
                  {lang === l && <Check className="size-5 text-teal-600" />}
                  {l === 'ar' ? 'العربية' : 'Français'}
                </button>
              ))}
            </div>
          </div>
          <button className="btn-primary w-full text-lg" onClick={async () => { await chooseLang(lang); setStep(1); }}>{t('common.next')}</button>
        </div>
      )}

      {step === 1 && (
        <div className="flex flex-1 flex-col">
          <div className="mb-4 text-center">
            <WalletIcon className="mx-auto size-10 text-teal-700" />
            <h1 className="mt-2 text-2xl font-bold">{t('onboarding.balancesTitle')}</h1>
            <p className="text-muted">{t('onboarding.balancesHint')}</p>
          </div>
          <div className="card flex-1 divide-y divide-line">
            {wallets?.filter((w) => !w.archived).map((w) => (
              <label key={w.id} className="flex items-center gap-3 px-4 py-2">
                <IconBadge name={w.icon} color={w.color} size="sm" />
                <span className="flex-1 font-semibold">{w.sysKey ? t(`sys.${w.sysKey}`) : w.name}</span>
                <input className="input num w-32 text-end" dir="ltr" inputMode="decimal" placeholder="0"
                  value={balances[w.id] ?? ''} onChange={(e) => setBalances({ ...balances, [w.id]: e.target.value })} />
                <span className="w-10 text-sm text-muted">{currencyLabel(s.currency, lang)}</span>
              </label>
            ))}
          </div>
          <p className="my-3 text-center text-sm text-muted">{t('onboarding.balancesLater')}</p>
          <button className="btn-primary w-full text-lg" onClick={saveBalances}>{t('common.next')}</button>
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-1 flex-col">
          <div className="mb-4 text-center">
            <ShieldCheck className="mx-auto size-10 text-teal-700" />
            <h1 className="mt-2 text-2xl font-bold">{t('onboarding.pinTitle')}</h1>
            <p className="text-muted">{t('onboarding.pinHint')}</p>
          </div>
          <PinSetup onDone={finish} />
          <button className="btn-ghost mt-3 w-full" onClick={finish}>{t('onboarding.skipPin')}</button>
        </div>
      )}
    </div>
  );
}
