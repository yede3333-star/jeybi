import { describe, expect, it } from 'vitest';
import { bucketsFor, customPeriod, periodDays, periodFor, previousPeriod, shiftPeriod } from '../lib/period';

const d = (y: number, m: number, day: number, h = 0) => new Date(y, m - 1, day, h).getTime();

describe('week boundaries', () => {
  // 2026-09-23 is a Wednesday
  const wed = d(2026, 9, 23, 15);
  it('starts on Monday by default', () => {
    const p = periodFor('week', wed);
    expect(p.start).toBe(d(2026, 9, 21));
    expect(p.end).toBe(d(2026, 9, 28));
  });
  it('can start on Saturday or Sunday', () => {
    expect(periodFor('week', wed, 6).start).toBe(d(2026, 9, 19));
    expect(periodFor('week', wed, 0).start).toBe(d(2026, 9, 20));
  });
  it('a Monday belongs to the week it starts', () => {
    expect(periodFor('week', d(2026, 9, 21), 1).start).toBe(d(2026, 9, 21));
    // with a Saturday start, Monday belongs to the week started two days before
    expect(periodFor('week', d(2026, 9, 21), 6).start).toBe(d(2026, 9, 19));
  });
  it('spans year boundaries', () => {
    const p = periodFor('week', d(2027, 1, 1)); // Friday
    expect(p.start).toBe(d(2026, 12, 28));
    expect(p.end).toBe(d(2027, 1, 4));
  });
});

describe('month and year boundaries', () => {
  it('handles February in leap years', () => {
    const p = periodFor('month', d(2028, 2, 15));
    expect(p.start).toBe(d(2028, 2, 1));
    expect(p.end).toBe(d(2028, 3, 1));
    expect(periodDays(p)).toBe(29);
    expect(periodDays(periodFor('month', d(2026, 2, 15)))).toBe(28);
  });
  it('the last millisecond of the month is inside, the first of next month is not', () => {
    const p = periodFor('month', d(2026, 9, 1));
    expect(p.end - 1).toBeLessThan(p.end);
    expect(periodFor('month', p.end - 1).start).toBe(p.start);
    expect(periodFor('month', p.end).start).toBe(p.end);
  });
  it('navigates months across years', () => {
    const jan = periodFor('month', d(2027, 1, 10));
    expect(previousPeriod(jan).start).toBe(d(2026, 12, 1));
    expect(shiftPeriod(periodFor('month', d(2026, 12, 5)), 1).start).toBe(d(2027, 1, 1));
  });
  it('year covers 12 months', () => {
    const y = periodFor('year', d(2026, 6, 1));
    expect(y.start).toBe(d(2026, 1, 1));
    expect(y.end).toBe(d(2027, 1, 1));
    expect(bucketsFor(y)).toHaveLength(12);
  });
});

describe('custom periods', () => {
  it('includes both end days and normalises order', () => {
    const p = customPeriod(d(2026, 9, 10, 18), d(2026, 9, 1));
    expect(p.start).toBe(d(2026, 9, 1));
    expect(p.end).toBe(d(2026, 9, 11));
    expect(periodDays(p)).toBe(10);
  });
  it('previous custom period has the same length and ends where this one starts', () => {
    const p = customPeriod(d(2026, 9, 1), d(2026, 9, 10));
    const prev = previousPeriod(p);
    expect(prev.end).toBe(p.start);
    expect(periodDays(prev)).toBe(10);
  });
});

describe('timeline buckets', () => {
  it('day → 3-hour blocks, month → days, long custom → months', () => {
    expect(bucketsFor(periodFor('day', d(2026, 9, 23)))).toHaveLength(8);
    expect(bucketsFor(periodFor('month', d(2026, 9, 23)))).toHaveLength(30);
    expect(bucketsFor(periodFor('week', d(2026, 9, 23)))).toHaveLength(7);
    const long = bucketsFor(customPeriod(d(2026, 1, 15), d(2026, 6, 10)));
    expect(long[0].unit).toBe('month');
    expect(long[0].start).toBe(d(2026, 1, 15));
    expect(long).toHaveLength(6);
  });
});
