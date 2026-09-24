// Zakat estimate (for guidance only) and hawl tracking on the Umm al-Qura Hijri calendar.
import { addDays, startOfDay } from 'date-fns';

export const NISAB_GRAMS = { gold: 85, silver: 595 } as const;
/** 2.5% = 25 / 1000 */
const RATE_NUM = 25, RATE_DEN = 1000;

export interface ZakatInput {
  /** Balances of the wallets counted (base minor units). */
  walletBalances: number[];
  receivables: number;
  payables: number;
  includeReceivables: boolean;
  subtractPayables: boolean;
  basis: 'gold' | 'silver';
  /** Price of one gram (base minor units). */
  gramPrice: number;
}

export interface ZakatResult {
  cash: number;
  receivables: number;
  payables: number;
  total: number;
  nisab: number;
  reached: boolean;
  due: number;
}

export function computeZakat(i: ZakatInput): ZakatResult {
  const cash = i.walletBalances.reduce((a, v) => a + v, 0);
  const receivables = i.includeReceivables ? i.receivables : 0;
  const payables = i.subtractPayables ? i.payables : 0;
  const total = Math.max(0, cash + receivables - payables);
  const nisab = NISAB_GRAMS[i.basis] * i.gramPrice;
  const reached = i.gramPrice > 0 && total >= nisab;
  // Integer arithmetic, rounded half up: total × 25 / 1000
  const due = reached ? Math.floor((total * RATE_NUM + RATE_DEN / 2) / RATE_DEN) : 0;
  return { cash, receivables, payables, total, nisab, reached, due };
}

// ---------- Hijri (islamic-umalqura) ----------

const partsFmt = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', { year: 'numeric', month: 'numeric', day: 'numeric' });

/** Hijri year/month/day of a date (Umm al-Qura). */
export function hijri(ms: number): { y: number; m: number; d: number } {
  const p = partsFmt.formatToParts(ms);
  const get = (t: string) => Number(p.find((x) => x.type === t)?.value.replace(/\D/g, ''));
  return { y: get('year'), m: get('month'), d: get('day') };
}

const cmp = (a: { y: number; m: number; d: number }, b: { y: number; m: number; d: number }) => a.y - b.y || a.m - b.m || a.d - b.d;

/**
 * End of the hawl: the first day on or after which one full lunar year has passed since `start`
 * (same Hijri day next year, or the first day of the following month when that day doesn't exist).
 */
export function hawlEnd(start: number): number {
  const s = hijri(start);
  const target = { y: s.y + 1, m: s.m, d: s.d };
  let day = startOfDay(addDays(start, 340));
  for (let i = 0; i < 40; i++) {
    const h = hijri(+day);
    if (cmp(h, target) >= 0) return +day;
    day = addDays(day, 1);
  }
  return +startOfDay(addDays(start, 354)); // unreachable with valid dates
}

export function hawlStatus(start: number | null, now = Date.now()) {
  if (start == null) return null;
  const end = hawlEnd(start);
  return { start, end, complete: now >= end, daysLeft: Math.max(0, Math.ceil((end - now) / 86_400_000)) };
}

/** "12 رمضان 1447 هـ" with Latin digits, in Arabic or French. */
export function formatHijri(ms: number, lang: 'ar' | 'fr'): string {
  const loc = lang === 'ar' ? 'ar-u-ca-islamic-umalqura-nu-latn' : 'fr-u-ca-islamic-umalqura-nu-latn';
  return new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'long', year: 'numeric', numberingSystem: 'latn', calendar: 'islamic-umalqura' } as Intl.DateTimeFormatOptions).format(ms);
}
