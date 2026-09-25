// Privacy mode ("إخفاء المبالغ"): amounts are shown as "••••• أوقية". The real figure travels
// inside the masked text as invisible Unicode tag characters (U+E0020–U+E007E, one per ASCII
// character), so a long press on any masked amount can reveal that one amount — on every screen,
// without each screen knowing about it. Only the display is masked: nothing is recomputed.
import { formatMoney, formatNumber, type Lang } from './money';

export const MASK = '•••••';
const TAG_BASE = 0xe0000;
const TAG_FIRST = 0xe0020;
const TAG_LAST = 0xe007e;
const LRI = String.fromCharCode(0x2066);
const PDI = String.fromCharCode(0x2069);
const BIDI = new RegExp(`[${LRI}${PDI}]`, 'g');
const RUN = new RegExp(`${MASK}((?:${String.fromCodePoint(0xdb40)}[${String.fromCharCode(0xdc20)}-${String.fromCharCode(0xdc7e)}])+)`, 'g');

/** Invisible copy of a short ASCII text (digits, sign, separators, spaces). */
export function encodeHidden(s: string): string {
  let out = '';
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    const ascii = c === 0xa0 || c === 0x202f ? 0x20 : c;
    if (ascii >= 0x20 && ascii <= 0x7e) out += String.fromCodePoint(TAG_BASE + ascii);
  }
  return out;
}

function decode(run: string): string {
  let out = '';
  for (const ch of run) {
    const cp = ch.codePointAt(0)!;
    if (cp >= TAG_FIRST && cp <= TAG_LAST) out += String.fromCharCode(cp - TAG_BASE);
  }
  return out;
}

/** "••••• أوقية" (the real number hidden inside). */
export function maskMoney(minor: number, lang: Lang, currency: string, opts: { sign?: boolean; currency?: boolean } = {}): string {
  const real = formatMoney(minor, lang, currency, { ...opts, currency: false }).replace(BIDI, '');
  const masked = `${MASK}${encodeHidden(real)}`;
  const body = lang === 'ar' ? `${LRI}${masked}${PDI}` : masked;
  if (opts.currency === false) return body;
  const full = formatMoney(minor, lang, currency, opts);
  const label = full.slice(formatMoney(minor, lang, currency, { ...opts, currency: false }).length); // " أوقية"
  return `${body}${label}`;
}

export function maskNumber(minor: number, lang: Lang): string {
  return `${MASK}${encodeHidden(formatNumber(minor, lang))}`;
}

export const isMasked = (text: string) => text.includes(MASK);

/**
 * The real figures hidden in a text (in order). With `offset` (a position in the text), only the
 * masked amount closest to it.
 */
export function revealIn(text: string, offset?: number): string[] {
  const found: Array<{ at: number; value: string }> = [];
  for (const m of text.matchAll(RUN)) found.push({ at: m.index!, value: decode(m[1]) });
  if (offset == null || found.length <= 1) return found.map((f) => f.value);
  const best = found.reduce((a, b) => (Math.abs(b.at - offset) < Math.abs(a.at - offset) ? b : a));
  return [best.value];
}
