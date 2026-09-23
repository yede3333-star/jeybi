import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Fingerprint, KeyRound, Lock, Timer } from 'lucide-react';
import { PageHeader, Toggle, Sheet } from '../components/ui';
import { PinPad } from '../components/Lock';
import { useToast } from '../components/Toast';
import { useSettings } from '../hooks/settings';
import { setSettings } from '../repo/settings';
import { biometricAvailable, hashPin, registerBiometric, verifyPin } from '../services/security';

/** Two-step PIN creation (enter, confirm). 4 to 6 digits. */
export function PinSetup({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const [first, setFirst] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const press = (k: string) => {
    setError(null);
    if (k === 'back') setPin((p) => p.slice(0, -1));
    else setPin((p) => (p.length < 6 ? p + k : p));
  };

  const next = async () => {
    if (pin.length < 4) return;
    if (first === null) { setFirst(pin); setPin(''); return; }
    if (pin !== first) { setError(t('security.mismatch')); setFirst(null); setPin(''); return; }
    setBusy(true);
    const { hash, salt, iterations } = await hashPin(pin);
    await setSettings({ pinHash: hash, pinSalt: salt, pinIterations: iterations, pinLength: pin.length });
    setBusy(false);
    onDone();
  };

  return (
    <div className="flex flex-col items-center gap-5">
      <p className={`font-semibold ${error ? 'text-expense' : ''}`}>{error ?? (first === null ? t('security.enterNewPin') : t('security.confirmPin'))}</p>
      <div dir="ltr" className="flex h-4 gap-3">
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className={`size-4 rounded-full ${i < pin.length ? 'bg-teal-700 dark:bg-teal-400' : i < 4 ? 'bg-black/15 dark:bg-white/20' : 'bg-black/5 dark:bg-white/10'}`} />
        ))}
      </div>
      <PinPad onPress={press} />
      <button className="btn-primary w-full max-w-xs" disabled={pin.length < 4 || busy} onClick={next}>
        {first === null ? t('common.next') : t('common.confirm')}
      </button>
    </div>
  );
}

const TIMEOUTS = [0, 1, 5, 15, 60];

export default function Security() {
  const { t } = useTranslation();
  const s = useSettings();
  const toast = useToast();
  const [setup, setSetup] = useState(false);
  const [verifyFor, setVerifyFor] = useState<null | 'remove' | 'change'>(null);
  const [bioOk, setBioOk] = useState<boolean | null>(null);

  useEffect(() => { void biometricAvailable().then(setBioOk); }, []);

  const toggleBio = async (on: boolean) => {
    if (!on) {
      await setSettings({ bioCredentialId: null, bioPublicKey: null, bioAlg: null });
      return;
    }
    try {
      const c = await registerBiometric(t('app.name'));
      await setSettings({ bioCredentialId: c.credentialId, bioPublicKey: c.publicKey, bioAlg: c.alg });
      toast({ message: t('security.bioEnabled') });
    } catch (e) {
      toast({ message: `${t('security.bioFailed')} (${(e as Error).name || e})`, tone: 'error' });
    }
  };

  return (
    <div>
      <PageHeader back title={t('settings.security')} />
      <div className="space-y-3 px-4">
        <div className="card divide-y divide-line">
          <div className="flex min-h-16 items-center gap-3 px-4">
            <Lock className="size-5 text-muted" />
            <div className="flex-1">
              <p className="font-semibold">{t('security.pin')}</p>
              <p className="text-sm text-muted">{s.pinHash ? t('security.pinOn', { n: s.pinLength }) : t('security.pinOff')}</p>
            </div>
            <Toggle checked={!!s.pinHash} label={t('security.pin')} onChange={(on) => (on ? setSetup(true) : setVerifyFor('remove'))} />
          </div>
          {s.pinHash && (
            <>
              <button className="flex min-h-14 w-full items-center gap-3 px-4 text-start" onClick={() => setVerifyFor('change')}>
                <KeyRound className="size-5 text-muted" />
                <span className="flex-1 font-semibold">{t('security.changePin')}</span>
              </button>
              <div className="flex min-h-16 items-center gap-3 px-4">
                <Timer className="size-5 text-muted" />
                <span className="flex-1 font-semibold">{t('security.lockAfter')}</span>
                <select className="input w-40" value={s.lockTimeoutMin} onChange={(e) => setSettings({ lockTimeoutMin: Number(e.target.value) })}>
                  {TIMEOUTS.map((m) => <option key={m} value={m}>{m === 0 ? t('security.immediately') : t('security.minutes', { n: m })}</option>)}
                </select>
              </div>
              {bioOk && (
                <div className="flex min-h-16 items-center gap-3 px-4">
                  <Fingerprint className="size-5 text-muted" />
                  <div className="flex-1">
                    <p className="font-semibold">{t('security.biometric')}</p>
                    <p className="text-sm text-muted">{t('security.biometricHint')}</p>
                  </div>
                  <Toggle checked={!!s.bioCredentialId} label={t('security.biometric')} onChange={toggleBio} />
                </div>
              )}
            </>
          )}
        </div>
        {bioOk === false && s.pinHash && <p className="px-1 text-sm text-muted">{t('security.bioUnavailable')}</p>}
        <p className="px-1 text-sm text-muted">{t('security.localNote')}</p>
      </div>

      <Sheet open={setup} onClose={() => setSetup(false)} title={s.pinHash ? t('security.changePin') : t('security.createPin')}>
        <PinSetup onDone={() => { setSetup(false); toast({ message: t('security.pinSaved') }); }} />
      </Sheet>
      <Sheet open={verifyFor !== null} onClose={() => setVerifyFor(null)} title={t('security.currentPin')}>
        <VerifyCurrent onOk={async () => {
          if (verifyFor === 'remove') {
            await setSettings({ pinHash: null, pinSalt: null, bioCredentialId: null, bioPublicKey: null, bioAlg: null });
            toast({ message: t('security.pinRemoved') });
          } else setSetup(true);
          setVerifyFor(null);
        }} />
      </Sheet>
    </div>
  );
}

function VerifyCurrent({ onOk }: { onOk: () => void }) {
  const { t } = useTranslation();
  const s = useSettings();
  const [pin, setPin] = useState('');
  const [bad, setBad] = useState(false);
  useEffect(() => {
    if (pin.length !== s.pinLength) return;
    void verifyPin(pin, s).then((ok) => (ok ? onOk() : (setBad(true), setPin(''))));
  }, [pin, s, onOk]);
  return (
    <div className="flex flex-col items-center gap-5">
      <p className={bad ? 'font-semibold text-expense' : 'text-muted'}>{bad ? t('lock.wrong') : t('lock.enterPin')}</p>
      <div dir="ltr" className="flex gap-3">
        {Array.from({ length: s.pinLength }, (_, i) => <span key={i} className={`size-4 rounded-full ${i < pin.length ? 'bg-teal-700' : 'bg-black/15 dark:bg-white/20'}`} />)}
      </div>
      <PinPad onPress={(k) => { setBad(false); setPin((p) => (k === 'back' ? p.slice(0, -1) : p.length < s.pinLength ? p + k : p)); }} />
    </div>
  );
}
