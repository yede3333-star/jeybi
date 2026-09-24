import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Delete, Fingerprint, Lock as LockIcon } from 'lucide-react';
import { useSettings } from '../hooks/settings';
import { verifyBiometric, verifyPin, createPinHash } from '../services/security';
import { logError } from '../services/errorLog';
import { markFirstScreen, markUnlockStart } from '../services/startupTiming';
import { setSettings } from '../repo/settings';

// Set when the user has just proven they know the PIN (created it during onboarding, or unlocked),
// so the gate doesn't ask again right away. Kept in sessionStorage (this tab only) because an app
// update makes the page reload automatically right after opening — without this, the user would be
// asked for the PIN twice.
const UNLOCK_KEY = 'jeybi:unlockedAt';
const RECENT_MS = 60_000;
export const markUnlocked = () => {
  try { sessionStorage.setItem(UNLOCK_KEY, String(Date.now())); } catch { /* private mode */ }
};
const recentlyUnlocked = () => {
  try { return Date.now() - Number(sessionStorage.getItem(UNLOCK_KEY) ?? 0) < RECENT_MS; } catch { return false; }
};

/** Keeps the app locked behind the PIN on launch and after the configured idle time. */
export function LockGate({ children }: { children: ReactNode }) {
  const s = useSettings();
  const hasPin = !!s.pinHash;
  const [locked, setLocked] = useState(hasPin && !recentlyUnlocked());
  const lastActive = useRef(Date.now());
  const hiddenAt = useRef<number | null>(null);

  useEffect(() => {
    if (!hasPin) setLocked(false);
  }, [hasPin]);

  useEffect(() => {
    if (!hasPin) return;
    const timeoutMs = s.lockTimeoutMin * 60_000;
    const touch = () => { lastActive.current = Date.now(); };
    const onVis = () => {
      if (document.visibilityState === 'hidden') hiddenAt.current = Date.now();
      else if (hiddenAt.current != null && Date.now() - hiddenAt.current >= timeoutMs) setLocked(true);
    };
    const timer = window.setInterval(() => {
      if (timeoutMs > 0 && Date.now() - lastActive.current >= timeoutMs) setLocked(true);
    }, 10_000);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pointerdown', touch);
    window.addEventListener('keydown', touch);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pointerdown', touch);
      window.removeEventListener('keydown', touch);
    };
  }, [hasPin, s.lockTimeoutMin]);

  if (locked) return <LockScreen onUnlock={() => { lastActive.current = Date.now(); markUnlocked(); setLocked(false); }} />;
  return <>{children}</>;
}

export function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const { t } = useTranslation();
  const s = useSettings();
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  // Whether the biometric is usable was checked when it was enabled. Checking again here
  // (isUserVerifyingPlatformAuthenticatorAvailable) is slow on Android and delayed the prompt.
  const hasBio = !!s.bioCredentialId;
  const [bioState, setBioState] = useState<'idle' | 'pending' | 'failed'>('idle');
  const [checking, setChecking] = useState(false);
  const tried = useRef(false);

  useEffect(() => { markFirstScreen('lock'); }, []);

  // Unlocking with the biometric never runs PBKDF2: only the signature check (a few ms).
  const tryBio = useCallback(async () => {
    if (!s.bioCredentialId) return;
    setBioState('pending');
    try {
      const ok = await verifyBiometric({ credentialId: s.bioCredentialId, publicKey: s.bioPublicKey, alg: s.bioAlg });
      if (ok) { markUnlockStart('bio'); onUnlock(); return; }
      setBioState('failed');
    } catch (e) {
      // NotAllowedError = cancelled / timed out: expected, the PIN is right there.
      const name = (e as Error)?.name;
      if (name !== 'NotAllowedError' && name !== 'AbortError') logError(e, 'bio:unlock');
      setBioState('failed');
    }
  }, [s.bioCredentialId, s.bioPublicKey, s.bioAlg, onUnlock]);

  // Prompt once, after the lock screen has been painted, and only while the app is visible.
  useEffect(() => {
    if (!hasBio) return;
    const start = () => {
      if (tried.current || document.visibilityState !== 'visible') return;
      tried.current = true;
      requestAnimationFrame(() => setTimeout(() => { void tryBio(); }, 0));
    };
    start();
    document.addEventListener('visibilitychange', start);
    return () => document.removeEventListener('visibilitychange', start);
  }, [hasBio, tryBio]);

  useEffect(() => {
    if (pin.length < s.pinLength || checking) return;
    setChecking(true);
    markUnlockStart('pin'); // includes the PIN check itself
    void verifyPin(pin, s).then((ok) => {
      setChecking(false);
      if (!ok) { setError(true); setPin(''); navigator.vibrate?.(150); return; }
      // One-time upgrade of PINs created with the old fixed 210k iterations (slow on phones).
      if (!s.pinCalibrated) {
        setTimeout(() => {
          void createPinHash(pin).then(({ hash, salt, iterations }) =>
            setSettings({ pinHash: hash, pinSalt: salt, pinIterations: iterations, pinCalibrated: true }));
        }, 1500);
      }
      onUnlock();
    });
  }, [pin, s, onUnlock, checking]);

  const press = (k: string) => {
    setError(false);
    if (k === 'back') setPin((p) => p.slice(0, -1));
    // functional update: fast typing (several keys before a re-render) never loses or adds a digit
    else setPin((p) => (p.length < s.pinLength ? p + k : p));
  };

  return (
    <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-6 bg-page px-6">
      <div className="flex size-16 items-center justify-center rounded-full bg-teal-700 text-white">
        <LockIcon className="size-8" />
      </div>
      <div className="text-center">
        <h1 className="text-2xl font-bold">{t('app.name')}</h1>
        <p className={`mt-1 ${error ? 'text-expense font-semibold' : 'text-muted'}`}>
          {error ? t('lock.wrong') : bioState === 'pending' ? t('lock.bioPending') : bioState === 'failed' ? t('lock.bioFailed') : t('lock.enterPin')}
        </p>
      </div>
      <div dir="ltr" className="flex gap-3" aria-label={t('lock.enterPin')}>
        {Array.from({ length: s.pinLength }, (_, i) => (
          <span key={i} className={`size-4 rounded-full ${i < pin.length ? 'bg-teal-700 dark:bg-teal-400' : 'bg-black/15 dark:bg-white/20'}`} />
        ))}
      </div>
      <PinPad onPress={press} extra={hasBio ? (
        <button className="flex h-16 items-center justify-center rounded-2xl text-teal-700 active:bg-black/5 dark:text-teal-400" onClick={tryBio} aria-label={t('lock.useBiometric')}>
          <Fingerprint className="size-8" />
        </button>
      ) : <span />} />
    </div>
  );
}

export function PinPad({ onPress, extra }: { onPress: (k: string) => void; extra?: ReactNode }) {
  const latest = useRef(onPress);
  latest.current = onPress;
  // Attached once, before the first paint: keys typed as soon as the pad is visible are never lost.
  useLayoutEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) latest.current(e.key);
      else if (e.key === 'Backspace') latest.current('back');
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div dir="ltr" className="grid w-full max-w-xs grid-cols-3 gap-3">
      {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((k) => (
        <button key={k} className="h-16 rounded-2xl bg-surface text-2xl font-semibold ring-1 ring-line active:bg-teal-600/15" onClick={() => onPress(k)}>{k}</button>
      ))}
      {extra ?? <span />}
      <button className="h-16 rounded-2xl bg-surface text-2xl font-semibold ring-1 ring-line active:bg-teal-600/15" onClick={() => onPress('0')}>0</button>
      <button className="flex h-16 items-center justify-center rounded-2xl active:bg-black/5" onClick={() => onPress('back')} aria-label="backspace">
        <Delete className="size-6" />
      </button>
    </div>
  );
}
