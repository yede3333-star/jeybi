import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import i18n, { setLanguage } from '../i18n';
import { getSettings, type Settings } from '../repo/settings';
import type { Lang } from '../lib/money';

const Ctx = createContext<Settings | null>(null);

function usePrefersDark() {
  const [dark, setDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const on = () => setDark(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return dark;
}

/** Applies language direction, theme and font size to <html>, and caches them for the next first paint. */
export function applyUi(lang: Lang, theme: Settings['theme'], fontSize: Settings['fontSize'], prefersDark: boolean) {
  const h = document.documentElement;
  h.lang = lang;
  h.dir = lang === 'ar' ? 'rtl' : 'ltr';
  const dark = theme === 'dark' || (theme === 'system' && prefersDark);
  h.classList.toggle('dark', dark);
  h.dataset.font = fontSize;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0b1412' : '#0f766e');
  if (i18n.language !== lang) void setLanguage(lang);
  try {
    localStorage.setItem('jeybi:ui', JSON.stringify({ lang, theme, fontSize }));
  } catch { /* private mode */ }
}

export function SettingsProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const s = useLiveQuery(getSettings);
  const prefersDark = usePrefersDark();
  const lang: Lang = s?.lang ?? (i18n.language === 'fr' ? 'fr' : 'ar');
  useEffect(() => {
    if (s) applyUi(lang, s.theme, s.fontSize, prefersDark);
  }, [s, lang, prefersDark]);
  if (!s) return <>{fallback}</>;
  return <Ctx.Provider value={s}>{children}</Ctx.Provider>;
}

export function useSettings(): Settings {
  const s = useContext(Ctx);
  if (!s) throw new Error('SettingsProvider missing');
  return s;
}

export function useLang(): Lang {
  const s = useSettings();
  return s.lang ?? (i18n.language === 'fr' ? 'fr' : 'ar');
}
