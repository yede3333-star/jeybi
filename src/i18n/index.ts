import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

export type UiLang = 'ar' | 'fr';

// Each dictionary is its own chunk: only the active language is loaded (and parsed) at startup.
const loaders: Record<UiLang, () => Promise<{ default: object }>> = {
  ar: () => import('./ar'),
  fr: () => import('./fr'),
};

function cachedLang(): UiLang {
  try {
    const l = JSON.parse(localStorage.getItem('jeybi:ui') || '{}').lang;
    if (l === 'ar' || l === 'fr') return l;
  } catch { /* ignore */ }
  return navigator.language?.startsWith('fr') ? 'fr' : 'ar';
}

export async function loadLanguage(lang: UiLang): Promise<void> {
  if (!i18n.hasResourceBundle(lang, 'translation')) {
    i18n.addResourceBundle(lang, 'translation', (await loaders[lang]()).default, true, true);
  }
}

export async function setLanguage(lang: UiLang): Promise<void> {
  await loadLanguage(lang);
  if (i18n.language !== lang) await i18n.changeLanguage(lang);
}

const initial = cachedLang();
/** Resolves when the first dictionary is ready (main.tsx waits for it before rendering). */
export const i18nReady: Promise<void> = i18n
  .use(initReactI18next)
  .init({
    resources: {},
    lng: initial,
    // The French dictionary is typed against the Arabic one, so no key is ever missing.
    fallbackLng: false,
    interpolation: { escapeValue: false },
  })
  .then(() => loadLanguage(initial))
  .then(() => undefined);

export default i18n;
