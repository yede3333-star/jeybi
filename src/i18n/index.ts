import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ar from './ar';
import fr from './fr';

export type UiLang = 'ar' | 'fr';

// Both dictionaries stay in the main bundle: loading the active one lazily was measured slower
// on a cold start (one more sequential request through the service worker before the first paint
// costs more than parsing ~20 KB).

function cachedLang(): UiLang {
  try {
    const l = JSON.parse(localStorage.getItem('jeybi:ui') || '{}').lang;
    if (l === 'ar' || l === 'fr') return l;
  } catch { /* ignore */ }
  return navigator.language?.startsWith('fr') ? 'fr' : 'ar';
}

export async function setLanguage(lang: UiLang): Promise<void> {
  if (i18n.language !== lang) await i18n.changeLanguage(lang);
}

void i18n
  .use(initReactI18next)
  .init({
    resources: { ar: { translation: ar }, fr: { translation: fr } },
    lng: cachedLang(),
    // The French dictionary is typed against the Arabic one, so no key is ever missing.
    fallbackLng: false,
    interpolation: { escapeValue: false },
    initAsync: false, // resources are in memory: ready before the first render
  });

export default i18n;
