import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearErrors, errorsAsText, logError, readErrors } from '../services/errorLog';

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  vi.stubGlobal('location', { hash: '#/transactions?q=12500' });
  vi.stubGlobal('document', { documentElement: { lang: 'ar' } });
  vi.stubGlobal('window', { dispatchEvent: () => true });
  vi.stubGlobal('navigator', { userAgent: 'test' });
  clearErrors();
});

describe('error log', () => {
  it('never stores amounts, balances or the search query', () => {
    logError(new Error('balance 1,250,000.50 below 45000 for 22 33 44 55'));
    const [e] = readErrors();
    expect(e.message).not.toMatch(/\d{3,}/);
    expect(e.message).not.toContain('1,250');
    expect(e.screen).toBe('#/transactions');
    expect(e.mode).toBe('standalone');
    expect(errorsAsText()).not.toMatch(/12500|45000/);
  });
  it('keeps only the last 50 entries, newest first', () => {
    for (let i = 0; i < 60; i++) logError(new Error(`e${i % 10}`), 'test');
    const list = readErrors();
    expect(list).toHaveLength(50);
    expect(list[0].message).toBe('e9');
  });
  it('never throws, even when storage is unavailable', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } });
    expect(() => logError('x')).not.toThrow();
    expect(readErrors()).toEqual([]);
  });
});
