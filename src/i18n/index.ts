import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ar from './ar';
import fr from './fr';

function cachedLang(): 'ar' | 'fr' {
  try {
    const l = JSON.parse(localStorage.getItem('jeybi:ui') || '{}').lang;
    if (l === 'ar' || l === 'fr') return l;
  } catch { /* ignore */ }
  return navigator.language?.startsWith('fr') ? 'fr' : 'ar';
}

void i18n.use(initReactI18next).init({
  resources: { ar: { translation: ar }, fr: { translation: fr } },
  lng: cachedLang(),
  fallbackLng: 'ar',
  interpolation: { escapeValue: false },
});

export default i18n;
