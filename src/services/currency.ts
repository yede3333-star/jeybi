// Foreign-currency entries with a manually entered rate (no internet).
// Rates are integers: base currency per 1 foreign unit × 10 000 (4 decimals), e.g. 43.25 → 432 500.
// Conversions use BigInt so large amounts never lose precision.

export const RATE_DECIMALS = 4;
const SCALE = 10n ** BigInt(RATE_DECIMALS);

/** foreign minor units × rate → base minor units, rounded half away from zero. */
export function toBase(origMinor: number, rateE4: number): number {
  const p = BigInt(origMinor) * BigInt(rateE4);
  const sign = p < 0n ? -1n : 1n;
  const abs = p < 0n ? -p : p;
  const q = (abs + SCALE / 2n) / SCALE;
  return Number(sign * q);
}

/** "43.25", "43,25", "٤٣٫٢٥" → 432500. Up to 4 decimals; null if invalid or ≤ 0. */
export function parseRate(input: string): number | null {
  const s = input
    .trim()
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٫,]/g, '.')
    .replace(/\s/g, '');
  const m = s.match(/^(\d+)(?:\.(\d{1,4}))?$/);
  if (!m) return null;
  const v = Number(m[1]) * 10 ** RATE_DECIMALS + Number((m[2] ?? '').padEnd(RATE_DECIMALS, '0'));
  return v > 0 && Number.isSafeInteger(v) ? v : null;
}

/** 432500 → "43.25" (trailing zeros removed, Latin digits). */
export function rateToString(rateE4: number): string {
  const i = Math.floor(rateE4 / 10 ** RATE_DECIMALS);
  const f = String(rateE4 % 10 ** RATE_DECIMALS).padStart(RATE_DECIMALS, '0').replace(/0+$/, '');
  return f ? `${i}.${f}` : String(i);
}

export function normalizeCurrencyCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
}
