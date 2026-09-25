// "اكتب يومك" parser: pure, no database. Every sentence below must be read exactly as described.
import { describe, expect, it } from 'vitest';
import { buildDefaultCategories, buildDefaultWallets } from '../data/defaults';
import ar from '../i18n/ar';
import fr from '../i18n/fr';
import { BLOCKING, parseDay, type SmartContext, type SmartEntry } from '../services/smartParse';
import type { Category } from '../data/types';

const categories = buildDefaultCategories(0);
const wallets = buildDefaultWallets(0);
const sys = (k: string) => [(ar.sys as Record<string, string>)[k], (fr.sys as Record<string, string>)[k]].filter(Boolean);
const walletId = (k: string) => wallets.find((w) => w.sysKey === k)!.id;
const catId = (k: string) => categories.find((c) => c.sysKey === k)!.id;
// Saturday 2026-10-03, 18:30
const now = +new Date(2026, 9, 3, 18, 30);

function ctx(extra: Partial<SmartContext> = {}): SmartContext {
  return {
    categories, wallets, labels: sys, baseCurrency: 'MRU',
    lastRates: { EUR: 430_000 }, rules: {}, now, ...extra,
  };
}

/** Compact description: "expense 50 groceries cash d0". */
function describe1(e: SmartEntry, c: Category[] = categories): string {
  const cat = c.find((x) => x.id === e.categoryId);
  const w = (id?: string) => (id ? wallets.find((x) => x.id === id)?.sysKey ?? id : '—');
  const day = Math.round((+new Date(new Date(now).toDateString()) - +new Date(new Date(e.date).toDateString())) / 86_400_000);
  const parts = [e.kind, String(e.amount / 100)];
  if (e.kind === 'expense' || e.kind === 'income') parts.push(cat?.sysKey ?? cat?.name ?? '?');
  if (e.kind === 'debt') parts.push(e.direction!, e.person ?? '');
  parts.push(w(e.walletId));
  if (e.kind === 'transfer') parts.push('→', w(e.toWalletId));
  if (day) parts.push(`d${day}`);
  return parts.join(' ');
}
const read = (s: string, c = ctx()) => parseDay(s, c).entries.map((e) => describe1(e, c.categories));

const CASES: Array<[string, string[]]> = [
  // the example from the spec
  ['خبز 50، تاكسي 100، رصيد 200 من بنكيلي، ودخلتني عمولة 2000',
    ['expense 50 groceries —', 'expense 100 taxi —', 'expense 200 phone bankily', 'income 2000 commissions —']],
  // fusha
  ['اشتريت خبزا بخمسين أوقية', ['expense 50 groceries —']],
  ['دفعت فاتورة الكهرباء 3500 من مصرفي', ['expense 3500 utilities masrvi']],
  ['استلمت الراتب 45000 في البنك', ['income 45000 salary bank']],
  ['دواء من الصيدلية 1200', ['expense 1200 health —']],
  ['إيجار الشهر 25000 بالسداد', ['expense 25000 rent sedad']],
  ['صدقة 200', ['expense 200 charity —']],
  ['غداء في المطعم 800', ['expense 800 restaurants —']],
  ['كتب المدرسة 1500', ['expense 1500 education —']],
  // Hassaniya
  ['أتاي 100 وسكر 150', ['expense 100 groceries —', 'expense 150 groceries —']],
  ['شريت لحم ب ألف وخمسمية', ['expense 1500 groceries —']],
  ['ليصانص ميتين', ['expense 200 fuel —']],
  ['حوت 300 ولبارح تاكسي 100', ['expense 300 groceries —', 'expense 100 taxi — d1']],
  ['جاني 5000 من خدمة', ['income 5000 services —']],
  ['وصلني راتب 60 ألف على بنكيلي', ['income 60000 salary bankily']],
  ['كار 50 ومازوت 2000', ['expense 50 transport —', 'expense 2000 fuel —']],
  ['دراعة 4000 من بنكيلي', ['expense 4000 clothes bankily']],
  ['الضو 1500 والكراء 20000', ['expense 1500 utilities —', 'expense 20000 rent —']],
  // French
  ['pain 50, taxi 100', ['expense 50 groceries —', 'expense 100 taxi —']],
  ['salaire reçu 45000', ['income 45000 salary —']],
  ['courses 2500 avec bankily', ['expense 2500 groceries bankily']],
  ['hier essence 3000', ['expense 3000 fuel — d1']],
  ['commission 1500 et crédit 300', ['income 1500 commissions —', 'expense 300 phone —']],
  ['pharmacie deux mille', ['expense 2000 health —']],
  // mixed Arabic / French
  ['taxi 100، خبز 50', ['expense 100 taxi —', 'expense 50 groceries —']],
  ['رصيد mattel 500', ['expense 500 phone —']],
  // numbers
  ['خبز ٥٠', ['expense 50 groceries —']],
  ['إيجار 25,000', ['expense 25000 rent —']],
  ['إيجار 25 000', ['expense 25000 rent —']],
  ['إيجار 25.000', ['expense 25000 rent —']],
  ['عصير 12.50', ['expense 12.5 restaurants —']],
  ['رز ب50', ['expense 50 groceries —']],
  ['رز بـ50', ['expense 50 groceries —']],
  ['زيت 700 أوقية', ['expense 700 groceries —']],
  ['زيت 700 MRU', ['expense 700 groceries —']],
  ['خبز مية وخمسين', ['expense 150 groceries —']],
  ['كهرباء ثلاث آلاف', ['expense 3000 utilities —']],
  ['كهرباء 3 آلاف', ['expense 3000 utilities —']],
  ['راتب مليون ونص', ['income 1500000 salary —']],
  ['خبز ألف قديمة', ['expense 100 groceries —']],
  // several entries, income and expense together, amount first
  ['50 خبز 100 تاكسي', ['expense 50 groceries —', 'expense 100 taxi —']],
  ['خبز 50\nتاكسي 100\nدخلتني 3000', ['expense 50 groceries —', 'expense 100 taxi —', 'income 3000 other_income —']],
  // transfers
  ['حولت 1000 من بنكيلي للكاش', ['transfer 1000 bankily → cash']],
  ['حولت 5000 لمصرفي', ['transfer 5000 — → masrvi']],
  ['virement 2000 de bankily vers banque', ['transfer 2000 bankily → bank']],
  // debts
  ['سلفت أحمد 500', ['debt 500 owed_to_me أحمد —']],
  ['تسلفت من سيدي 2000', ['debt 2000 i_owe سيدي —']],
  // dates
  ['أمس خبز 50، تاكسي 100', ['expense 50 groceries — d1', 'expense 100 taxi — d1']],
  ['أول أمس دواء 900', ['expense 900 health — d2']],
  ['يوم الخميس غداء 600', ['expense 600 food — d2']],
  ['اليوم شاي 100', ['expense 100 groceries —']],
  // tricky: comma without space, French article, weak number words, weekday that is today
  ['خبز 50,تاكسي 100', ['expense 50 groceries —', 'expense 100 taxi —']],
  ['une pizza 500', ['expense 500 restaurants —']],
  ['ست مية ليصانص', ['expense 600 fuel —']],
  ['السبت خبز 50', ['expense 50 groceries —']],
  ['خلصت الضو 1500 من بنكيلي', ['expense 1500 utilities bankily']],
  // unknown word: still an entry, in "other", flagged
  ['فلان 300', ['expense 300 other_expense —']],
];

describe('parseDay: sentences', () => {
  it.each(CASES)('%s', (sentence, expected) => {
    expect(read(sentence)).toEqual(expected);
  });
  it('has at least 40 sentences', () => expect(CASES.length).toBeGreaterThanOrEqual(40));
});

describe('parseDay: details', () => {
  it('keeps the exact part of the text each entry came from', () => {
    const text = 'خبز 50، تاكسي 100، رصيد 200 من بنكيلي، ودخلتني عمولة 2000';
    const r = parseDay(text, ctx());
    expect(r.entries.map((e) => e.text)).toEqual(['خبز 50', 'تاكسي 100', 'رصيد 200 من بنكيلي', 'ودخلتني عمولة 2000']);
    for (const e of r.entries) expect(text.slice(e.start, e.end)).toBe(e.text);
    expect(r.unknown).toEqual([]);
  });

  it('parts without an amount are reported as not understood', () => {
    const r = parseDay('خبز 50، ذهبت إلى السوق، تاكسي', ctx());
    expect(r.entries).toHaveLength(1);
    expect(r.unknown.map((u) => u.text)).toEqual(['ذهبت إلى السوق', 'تاكسي']);
  });

  it('a date alone is not "not understood" and applies to what follows', () => {
    const r = parseDay('البارح: خبز 50', ctx());
    expect(r.unknown).toEqual([]);
    expect(read('البارح: خبز 50')).toEqual(['expense 50 groceries — d1']);
  });

  it('foreign currency uses the last saved rate and says so; no rate = must be fixed', () => {
    const [eur] = parseDay('عشاء 20 يورو', ctx()).entries;
    expect(eur).toMatchObject({ origCurrency: 'EUR', origAmount: 2000, rateE4: 430_000, amount: 86_000 });
    expect(eur.warnings).toContain('foreign');
    const [usd] = parseDay('كتاب 10 دولار', ctx()).entries;
    expect(usd).toMatchObject({ origCurrency: 'USD', origAmount: 1000, amount: 0 });
    expect(usd.warnings).toContain('noRate');
  });

  it('flags a guessed category and a debt without a person', () => {
    expect(parseDay('فلان 300', ctx()).entries[0].warnings).toContain('noCategory');
    const [d] = parseDay('سلفت 500', ctx()).entries;
    expect(d.warnings).toEqual(expect.arrayContaining(['debt', 'noPerson']));
  });

  it('learned words win: "شاي ← عائلة" and a word → wallet', () => {
    const c = ctx({ rules: { 'شاي': { categoryId: catId('family') }, 'بنزين': { walletId: walletId('bankily') } } });
    expect(read('شاي 100', c)).toEqual(['expense 100 family —']);
    expect(read('بنزين 2000', c)).toEqual(['expense 2000 fuel bankily']);
    // a wallet named in the sentence still wins over a learned wallet
    expect(read('بنزين 2000 نقدا', c)).toEqual(['expense 2000 fuel cash']);
  });

  it("the user's own categories and wallets are recognised", () => {
    const mine: Category = { ...categories[0], id: 'mine', name: 'قهوة الصباح', sysKey: undefined, parentId: null, kind: 'expense' };
    const c = ctx({ categories: [...categories, mine], wallets: [...wallets, { ...wallets[0], id: 'w9', name: 'محفظة الدكان', sysKey: undefined }] });
    const [e] = parseDay('قهوة الصباح 150 من محفظة الدكان', c).entries;
    expect(e.categoryId).toBe('mine');
    expect(e.walletId).toBe('w9');
  });

  it('keyword and wallet word are recorded for learning', () => {
    const [e] = parseDay('شاي 100 من بنكيلي', ctx()).entries;
    expect(e.keyword).toBe('شاي');
    expect(e.walletWord).toBe('بنكيلي');
  });

  it('archived categories/wallets are never chosen; default wallet falls back to an active one', () => {
    const c = ctx({
      categories: categories.map((x) => (x.sysKey === 'taxi' ? { ...x, archived: true } : x)),
      wallets: wallets.map((w) => (w.sysKey === 'cash' ? { ...w, archived: true } : w)),
    });
    const [e] = parseDay('تاكسي 100', c).entries;
    expect(c.categories.find((x) => x.id === e.categoryId)?.sysKey).toBe('transport'); // the parent
    expect(e.walletId).toBe(''); // never a guessed wallet
  });

  it('a wallet not named in the sentence must be chosen (blocking), a named or learned one is used', () => {
    const [none] = parseDay('خبز 50', ctx()).entries;
    expect(none.walletId).toBe('');
    expect(none.warnings).toContain('noWallet');
    expect(BLOCKING).toContain('noWallet');
    const [named] = parseDay('خبز 50 من السداد', ctx()).entries;
    expect(named.walletId).toBe(walletId('sedad'));
    expect(named.warnings).not.toContain('noWallet');
    const [learned] = parseDay('بنزين 50', ctx({ rules: { 'بنزين': { walletId: walletId('bankily') } } })).entries;
    expect(learned.walletId).toBe(walletId('bankily'));
    // a transfer with one wallet named: the other one is left to choose
    const [tr] = parseDay('حولت 5000 لمصرفي', ctx()).entries;
    expect(tr).toMatchObject({ walletId: '', toWalletId: walletId('masrvi') });
    expect(tr.warnings).toContain('checkWallets');
  });

  it('is fast: a long day under 100 ms (after the dictionary is built)', () => {
    parseDay('خبز 50', ctx());
    const long = Array.from({ length: 20 }, (_, i) => `خبز ${i + 1}0، تاكسي 100 من بنكيلي، ودخلتني عمولة 2000`).join('، ');
    const t = performance.now();
    const r = parseDay(long, ctx());
    expect(performance.now() - t).toBeLessThan(100);
    expect(r.entries).toHaveLength(60);
  });
});
