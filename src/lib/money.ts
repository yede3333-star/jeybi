export type Lang = 'ar' | 'fr';

export const toMinor = (major: number): number => Math.round(major * 100);
export const fromMinor = (minor: number): number => minor / 100;

// Invisible bidi/spacing characters, spelled out by code point for readability.
const LRI = String.fromCharCode(0x2066); // left-to-right isolate
const PDI = String.fromCharCode(0x2069); // pop directional isolate
const NBSP = String.fromCharCode(0x00a0);
const SPACES = new RegExp(`[${String.fromCharCode(0x202f)}${NBSP}]`, 'g');
const EASTERN_DIGITS = /[٠-٩۰-۹]/g;

/** Locale used for numbers: always Latin digits (0-9), never Eastern Arabic digits. */
export const numberLocale = (lang: Lang) => (lang === 'ar' ? 'ar-u-nu-latn' : 'fr-FR-u-nu-latn');
/** Mauritanian Arabic month names (يناير، فبراير… أغشت، شتمبر) with Latin digits. */
export const dateLocale = (lang: Lang) => (lang === 'ar' ? 'ar-MR-u-nu-latn-ca-gregory' : 'fr-FR-u-nu-latn');

const nfCache = new Map<string, Intl.NumberFormat>();
function nf(lang: Lang, fraction: boolean): Intl.NumberFormat {
  const key = `${lang}|${fraction}`;
  let f = nfCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(numberLocale(lang), {
      numberingSystem: 'latn',
      minimumFractionDigits: fraction ? 2 : 0,
      maximumFractionDigits: fraction ? 2 : 0,
    } as Intl.NumberFormatOptions);
    nfCache.set(key, f);
  }
  return f;
}

export function currencyLabel(currency: string, lang: Lang): string {
  if (currency === 'MRU') return lang === 'ar' ? 'أوقية' : 'MRU';
  return currency;
}

/** Formats a minor-unit amount. Decimals are shown only when non-zero. */
export function formatNumber(minor: number, lang: Lang): string {
  const fraction = minor % 100 !== 0;
  // French uses narrow no-break spaces as thousands separator; normalise to a plain space for exports.
  return nf(lang, fraction).format(fromMinor(minor)).replace(SPACES, ' ');
}

/** In Arabic (RTL) the signed number is wrapped in an LTR isolate so "-1,250" never renders as "1,250-". */
const isolate = (s: string, lang: Lang) => (lang === 'ar' ? `${LRI}${s}${PDI}` : s);

export function formatMoney(
  minor: number,
  lang: Lang,
  currency = 'MRU',
  opts: { sign?: boolean; currency?: boolean } = {},
): string {
  const { sign = false, currency: showCur = true } = opts;
  const s = minor < 0 ? '-' : sign && minor > 0 ? '+' : '';
  const body = isolate(`${s}${formatNumber(Math.abs(minor), lang)}`, lang);
  if (!showCur) return body;
  return `${body}${lang === 'ar' ? ' ' : NBSP}${currencyLabel(currency, lang)}`;
}

export function formatPercent(value: number, lang: Lang, digits = 0): string {
  const s = new Intl.NumberFormat(numberLocale(lang), {
    numberingSystem: 'latn', maximumFractionDigits: digits, minimumFractionDigits: 0,
  } as Intl.NumberFormatOptions).format(value);
  return isolate(`${s}%`, lang);
}

/** Removes the invisible bidi marks (for tests / plain-text exports). */
export const stripBidi = (s: string) => s.split(LRI).join('').split(PDI).join('');

/**
 * Parses user input like "1250", "1 250,5", "1,250.50" into minor units.
 * Accepts both "." and "," as decimal separator when followed by 1-2 digits at the end.
 */
export function parseAmount(input: string): number | null {
  let s = input.trim().replace(/\s/g, '').replace(SPACES, '');
  // Convert any Eastern Arabic / Persian digits the keyboard might produce.
  s = s.replace(EASTERN_DIGITS, (d) => String(d.charCodeAt(0) >= 0x06f0 ? d.charCodeAt(0) - 0x06f0 : d.charCodeAt(0) - 0x0660));
  if (!s) return null;
  const m = s.match(/^(\d{1,3}(?:[.,]\d{3})+|\d+)(?:[.,](\d{1,2}))?$/);
  if (!m) return null;
  const intPart = m[1].replace(/[.,]/g, '');
  const frac = (m[2] ?? '').padEnd(2, '0');
  const v = Number(intPart) * 100 + Number(frac || '0');
  return Number.isFinite(v) ? v : null;
}

/** Keypad buffer helper: string with at most one "." and 2 decimals. */
export function keypadAppend(buf: string, key: string): string {
  if (key === 'back') return buf.slice(0, -1);
  if (key === '.') return buf.includes('.') ? buf : (buf || '0') + '.';
  if (buf.includes('.') && buf.split('.')[1].length >= 2) return buf;
  if (buf === '0') return key;
  if (buf.replace('.', '').length >= 12) return buf;
  return buf + key;
}

export function keypadToMinor(buf: string): number {
  if (!buf) return 0;
  const [i, f = ''] = buf.split('.');
  return Number(i || '0') * 100 + Number(f.padEnd(2, '0').slice(0, 2));
}

export function minorToKeypad(minor: number): string {
  if (!minor) return '';
  const i = Math.floor(minor / 100);
  const f = minor % 100;
  return f ? `${i}.${String(f).padStart(2, '0').replace(/0$/, '')}` : String(i);
}
