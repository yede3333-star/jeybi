// Section 6: privacy mode masks amounts in the display layer only; a long press can reveal one.
import { describe, expect, it } from 'vitest';
import { formatMoney } from '../lib/money';
import { encodeHidden, isMasked, MASK, maskMoney, maskNumber, revealIn } from '../lib/privacy';
import { makeFormatters } from '../hooks/fmt';

const visible = (s: string) => s.replace(/[\u{E0000}-\u{E007F}⁦⁩]/gu, '');

describe('privacy mode', () => {
  it('shows "••••• أوقية" / "••••• MRU", never the digits', () => {
    const ar = maskMoney(1_250_00, 'ar', 'MRU');
    expect(visible(ar)).toBe(`${MASK} أوقية`);
    expect(ar).not.toMatch(/[0-9]/);
    expect(visible(maskMoney(-50_00, 'fr', 'MRU'))).toBe(`${MASK} MRU`);
    expect(visible(maskMoney(3_000_00, 'ar', 'EUR', { currency: false }))).toBe(MASK);
    expect(visible(maskNumber(99_00, 'fr'))).toBe(MASK);
  });

  it('the real amount can be revealed from the masked text (one at a time)', () => {
    expect(revealIn(maskMoney(1_250_00, 'ar', 'MRU'))).toEqual(['1,250']);
    expect(revealIn(maskMoney(-1_250_50, 'fr', 'MRU', { sign: true }))).toEqual(['-1 250,50']);
    const line = `A: ${maskMoney(500_00, 'ar', 'MRU')} · B: ${maskMoney(200_00, 'ar', 'MRU')}`;
    expect(revealIn(line)).toEqual(['500', '200']);
    expect(revealIn(line, line.indexOf('B:'))).toEqual(['200']);
    expect(revealIn(line, 0)).toEqual(['500']);
    expect(revealIn('nothing hidden 123')).toEqual([]);
  });

  it('formatters: money and plain numbers masked, percentages and dates untouched, "real" for exports', () => {
    const hidden = makeFormatters('ar', 'MRU', true);
    const real = makeFormatters('ar', 'MRU', false);
    expect(isMasked(hidden.money(4_000_00))).toBe(true);
    expect(isMasked(hidden.num(4_000_00))).toBe(true);
    expect(hidden.pct(42)).toBe(real.pct(42));
    expect(hidden.date(0, 'short')).toBe(real.date(0, 'short'));
    expect(real.money(4_000_00)).toBe(formatMoney(4_000_00, 'ar', 'MRU'));
  });

  it('only printable ASCII is encoded (no surprises in copy/paste)', () => {
    expect([...encodeHidden('1 2,3-')].every((c) => c.codePointAt(0)! >= 0xe0020 && c.codePointAt(0)! <= 0xe007e)).toBe(true);
  });
});
