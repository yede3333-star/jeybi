import { describe, expect, it } from 'vitest';
import { formatMoney, formatNumber, formatPercent, keypadAppend, keypadToMinor, minorToKeypad, parseAmount, stripBidi, toMinor } from '../lib/money';
import { makeFormatters } from '../hooks/fmt';

const EASTERN = /[٠-٩۰-۹]/;

describe('number formatting', () => {
  it('always uses Latin digits in Arabic', () => {
    const s = formatMoney(4_500_000, 'ar');
    expect(s).not.toMatch(EASTERN);
    expect(stripBidi(s)).toBe('45,000 أوقية');
  });

  it('formats French with MRU and space grouping', () => {
    expect(formatMoney(4_500_000, 'fr').replace(/\s/g, ' ')).toBe('45 000 MRU');
  });

  it('shows decimals only when needed', () => {
    expect(formatNumber(125_050, 'ar')).toBe('1,250.50');
    expect(formatNumber(125_000, 'ar')).toBe('1,250');
  });

  it('keeps the minus sign before the number in Arabic', () => {
    expect(stripBidi(formatMoney(-150_000, 'ar'))).toBe('-1,500 أوقية');
    expect(stripBidi(formatMoney(150_000, 'ar', 'MRU', { sign: true }))).toBe('+1,500 أوقية');
  });

  it('formats percentages with Latin digits', () => {
    expect(stripBidi(formatPercent(40, 'ar'))).toBe('40%');
    expect(formatPercent(40, 'ar')).not.toMatch(EASTERN);
  });

  it('formats dates with Latin digits in Arabic', () => {
    const f = makeFormatters('ar', 'MRU');
    for (const style of ['short', 'medium', 'long', 'dateTime', 'time', 'monthYear'] as const) {
      expect(f.date(new Date(2026, 8, 23, 14, 5).getTime(), style)).not.toMatch(EASTERN);
    }
    expect(f.date(new Date(2026, 8, 23).getTime(), 'short')).toContain('2026');
  });
});

describe('amount parsing', () => {
  it('parses plain and grouped numbers', () => {
    expect(parseAmount('1250')).toBe(125_000);
    expect(parseAmount('1,250')).toBe(125_000);
    expect(parseAmount('1 250,5')).toBe(125_050);
    expect(parseAmount('1,250.50')).toBe(125_050);
    expect(parseAmount('0.05')).toBe(5);
  });
  it('converts Eastern Arabic digits', () => {
    expect(parseAmount('١٢٥٠')).toBe(125_000);
  });
  it('rejects garbage', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('1.2.3')).toBeNull();
  });
  it('avoids floating point errors', () => {
    expect(toMinor(0.1 + 0.2)).toBe(30);
    expect(toMinor(19.99)).toBe(1999);
  });
});

describe('keypad buffer', () => {
  it('builds amounts', () => {
    let b = '';
    for (const k of ['1', '2', '.', '5', '0', '9']) b = keypadAppend(b, k);
    expect(b).toBe('12.50'); // max 2 decimals
    expect(keypadToMinor(b)).toBe(1250);
    expect(keypadAppend('12', 'back')).toBe('1');
    expect(keypadAppend('', '.')).toBe('0.');
    expect(keypadAppend('0', '5')).toBe('5');
  });
  it('round-trips minor units', () => {
    expect(minorToKeypad(125_050)).toBe('1250.5');
    expect(keypadToMinor(minorToKeypad(125_050))).toBe(125_050);
    expect(minorToKeypad(20_000)).toBe('200');
  });
});
