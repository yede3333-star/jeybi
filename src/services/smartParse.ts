// "اكتب يومك": turns one free sentence ("خبز 50، تاكسي 100، رصيد 200 من بنكيلي، ودخلتني عمولة 2000")
// into entries the user reviews before anything is saved. Pure and synchronous: rules + the local
// dictionary in smartLexicon.ts, nothing leaves the device. Tested in src/tests/smartParse.test.ts.
import { startOfDay, subDays } from 'date-fns';
import { normalize } from './search';
import { toBase } from './currency';
import * as L from './smartLexicon';
import type { Category, CategoryKind, DebtDirection, ID, Wallet } from '../data/types';

export type SmartKind = 'expense' | 'income' | 'transfer' | 'debt';
/** Shown on the card; the ones in BLOCKING must be fixed (edited) before saving. */
export type SmartWarning = 'foreign' | 'noRate' | 'noCategory' | 'debt' | 'noPerson' | 'oldOuguiya' | 'checkWallets';
export const BLOCKING: SmartWarning[] = ['noRate', 'noPerson'];

export interface SmartEntry {
  /** Stable while the text around it doesn't change (keeps the user's edits across re-parses). */
  key: string;
  kind: SmartKind;
  /** Base currency, minor units (×100). */
  amount: number;
  origCurrency?: string;
  origAmount?: number;
  rateE4?: number;
  categoryId?: ID;
  walletId: ID;
  toWalletId?: ID;
  direction?: DebtDirection;
  person?: string;
  date: number;
  /** The part of the text this entry was read from, and where it is. */
  text: string;
  start: number;
  end: number;
  /** Normalised word that decided the category (or the first meaningful word): what a correction teaches. */
  keyword?: string;
  /** Normalised word that named the wallet, when one was named. */
  walletWord?: string;
  warnings: SmartWarning[];
}

export interface SmartSpan { text: string; start: number; end: number }
export interface SmartResult { entries: SmartEntry[]; unknown: SmartSpan[] }

/** Learned locally when the user corrects a card: normalised word → category and/or wallet. */
export interface SmartRule { categoryId?: ID; walletId?: ID; updatedAt?: number }

export interface SmartContext {
  categories: Category[];
  wallets: Wallet[];
  /** Displayed names of a built-in item in every UI language (like search). */
  labels: (sysKey: string) => string[];
  defaultWalletId: ID | null;
  baseCurrency: string;
  lastRates: Record<string, number>;
  rules: Record<string, SmartRule>;
  now: number;
}

// ---------------------------------------------------------------- dictionary (normalised once)

const n = (s: string) => normalize(s.replace(/’/g, "'"));
type Phrase = string[];
const phrases = (words: string[]): Phrase[] => words.map((w) => n(w).split(' ')).filter((p) => p[0]);

interface Dict {
  catWords: Array<{ p: Phrase; sysKey: string }>;
  walletWords: Array<{ p: Phrase; sysKey: string }>;
  income: Phrase[]; expense: Phrase[]; transfer: Phrase[]; lent: Phrase[]; borrowed: Phrase[];
  currency: Map<string, string>;
  numbers: Map<string, number>; weak: Map<string, number>; scales: Map<string, { scale: number; count?: number }>;
  half: Set<string>; days: Map<string, number>; dayBefore: Phrase[]; weekdays: Map<string, number>;
  filler: Set<string>; from: Set<string>; to: Set<string>;
  known: Set<string>;
}
let dict: Dict | null = null;
function D(): Dict {
  if (dict) return dict;
  const map = <V>(o: Record<string, V>) => new Map(Object.entries(o).map(([k, v]) => [n(k), v]));
  const currency = new Map<string, string>();
  for (const [code, words] of Object.entries(L.CURRENCY_WORDS)) for (const w of words) currency.set(n(w), code);
  const catWords = Object.entries(L.CATEGORY_WORDS).flatMap(([sysKey, ws]) => phrases(ws).map((p) => ({ p, sysKey })));
  const walletWords = Object.entries(L.WALLET_WORDS).flatMap(([sysKey, ws]) => phrases(ws).map((p) => ({ p, sysKey })));
  const d: Dict = {
    catWords, walletWords,
    income: phrases(L.INCOME_WORDS), expense: phrases(L.EXPENSE_WORDS), transfer: phrases(L.TRANSFER_WORDS),
    lent: phrases(L.DEBT_LENT_WORDS), borrowed: phrases(L.DEBT_BORROWED_WORDS),
    currency,
    numbers: map(L.NUMBER_WORDS), weak: map(L.WEAK_NUMBER_WORDS), scales: map(L.SCALE_WORDS),
    half: new Set(L.HALF_WORDS.map(n)), days: map(L.DAY_WORDS), dayBefore: L.DAY_BEFORE_YESTERDAY.map((p) => p.map(n)),
    weekdays: map(L.WEEKDAY_WORDS),
    filler: new Set(L.FILLER_WORDS.map(n)), from: new Set(L.FROM_WORDS.map(n)), to: new Set(L.TO_WORDS.map(n)),
    known: new Set(),
  };
  // Every single word the dictionary knows (decides whether a leading "و" is the conjunction).
  for (const list of [catWords.map((c) => c.p), walletWords.map((w) => w.p), d.income, d.expense, d.transfer, d.lent, d.borrowed])
    for (const p of list) d.known.add(p[0]);
  for (const k of [...currency.keys(), ...d.numbers.keys(), ...d.scales.keys(), ...d.days.keys(), ...d.weekdays.keys()]) d.known.add(k);
  return (dict = d);
}

// ---------------------------------------------------------------- tokens

interface Tok {
  raw: string;
  /** normalised */
  w: string;
  start: number;
  end: number;
  t: 'num' | 'word' | 'sym' | 'sep';
  /** num: value in major units */
  v?: number;
}

const TOKEN_RE = /([0-9٠-٩۰-۹]+(?:[.,٫٬][0-9٠-٩۰-۹]+)*)|([\p{L}\p{M}ـ]+(?:['’][\p{L}\p{M}]+)*)|([€$])|([،,؛;.!?؟\n\r]+)/gu;

/** "5,000" / "5.000" → 5000; "2,5" / "2.50" → 2.5; "1.500,50" → 1500.5. */
function numValue(s: string): number | null {
  const groups = s.split(/[.,]/);
  if (groups.length === 1) return Number(s);
  const last = groups[groups.length - 1];
  const middle = groups.slice(1, -1);
  if (groups.slice(1).every((g) => g.length === 3) && groups[0].length <= 3) return Number(groups.join(''));
  if (last.length <= 2 && middle.every((g) => g.length === 3)) return Number(`${groups.slice(0, -1).join('')}.${last}`);
  return null;
}

function tokenize(text: string): Tok[] {
  const out: Tok[] = [];
  for (const m of text.matchAll(TOKEN_RE)) {
    const start = m.index!;
    const raw = m[0];
    const end = start + raw.length;
    if (m[1]) {
      const s = n(raw).replace(/٫/g, '.').replace(/٬/g, ',');
      const v = numValue(s);
      if (v != null) out.push({ raw, w: s, start, end, t: 'num', v });
    } else if (m[2]) out.push({ raw, w: n(raw), start, end, t: 'word' });
    else if (m[3]) out.push({ raw, w: raw, start, end, t: 'sym' });
    else out.push({ raw, w: raw, start, end, t: 'sep' });
  }
  // "5 000" → 5000 (a space as thousands separator)
  for (let i = 0; i + 1 < out.length; i++) {
    const a = out[i], b = out[i + 1];
    if (a.t === 'num' && b.t === 'num' && /^\d{1,3}$/.test(a.w) && /^\d{3}$/.test(b.w) && /^[   ]$/.test(text.slice(a.end, b.start))) {
      out.splice(i, 2, { ...a, raw: text.slice(a.start, b.end), w: a.w + b.w, end: b.end, v: Number(a.w + b.w) });
      i--;
    }
  }
  return out;
}

const PREFIXES = ['وبال', 'ولل', 'وال', 'بال', 'فال', 'لل', 'ال', 'وب', 'ول', 'و', 'ب', 'ل'];
/** The word, and the word without Arabic prefixes (و، ب، ل، ال…) or a French elision (l', d'). */
function forms(w: string): string[] {
  const out = [w];
  const el = w.match(/^[a-z]'(.+)$/);
  if (el) out.push(el[1]);
  for (const p of PREFIXES) if (w.startsWith(p) && w.length - p.length >= 2) out.push(w.slice(p.length));
  // fusha accusative: "خبزا" → "خبز"
  for (const f of [...out]) if (f.length > 3 && f.endsWith('ا') && /[؀-ۿ]/.test(f)) out.push(f.slice(0, -1));
  return out;
}
/** Prefix that was removed to get `form` from `w` ('' if none). */
const prefixOf = (w: string, form: string) => (w.endsWith(form) ? w.slice(0, w.length - form.length) : '');

/** Does phrase `p` start at token i? Returns the matched form of the first word, or null. */
function phraseAt(toks: Tok[], i: number, p: Phrase): string | null {
  if (toks[i]?.t !== 'word') return null;
  const first = forms(toks[i].w).find((f) => f === p[0]);
  if (first == null) return null;
  for (let k = 1; k < p.length; k++) if (toks[i + k]?.t !== 'word' || toks[i + k].w !== p[k]) return null;
  return first;
}
function anyPhraseAt(toks: Tok[], i: number, list: Phrase[]): { form: string; len: number } | null {
  let best: { form: string; len: number } | null = null;
  for (const p of list) {
    const f = phraseAt(toks, i, p);
    if (f != null && (!best || p.length > best.len)) best = { form: f, len: p.length };
  }
  return best;
}

// ---------------------------------------------------------------- amounts

interface Amount { i: number; end: number; value: number }

/** Reads digits and/or number words starting at i ("ألف وخمسمية", "5 آلاف", "مية وخمسين", "1.5 مليون"). */
function readAmount(toks: Tok[], i: number): Amount | null {
  const d = D();
  let total = 0, current = 0, any = false, strong = false, lastScale = 0;
  let j = i;
  while (j < toks.length) {
    const tk = toks[j];
    if (tk.t === 'num') {
      if (any) break; // "100 200": two amounts
      current = tk.v!;
      any = strong = true;
      j++;
      continue;
    }
    if (tk.t !== 'word') break;
    // inside an amount, "و" joins numbers: "ألف و خمسمية", "ألف وخمسمية"
    if (tk.w === 'و' && any && j + 1 < toks.length && isNumberWord(toks[j + 1].w, true)) { j++; continue; }
    // "وخمسمية", "ونص" inside an amount; "بخمسين" (ب = for) at its start
    const rest1 = tk.w.slice(1);
    const w = any && tk.w.startsWith('و') && (isNumberWord(rest1, true) || d.half.has(rest1)) ? rest1
      : !any && tk.w.startsWith('ب') && isNumberWord(rest1) ? rest1 : tk.w;
    const scale = d.scales.get(w);
    if (scale) {
      total += (scale.count ?? (current || 1)) * scale.scale;
      current = 0;
      lastScale = scale.scale;
      any = strong = true;
      j++;
      continue;
    }
    if (lastScale && d.half.has(w)) { total += lastScale / 2; lastScale = 0; j++; continue; }
    let v = d.numbers.get(w);
    const weak = v == null ? d.weak.get(w) : undefined;
    if (weak != null) {
      // "ست" (six / madam), "سبع" (seven / lion): only numbers next to another number word
      const next = toks[j + 1];
      if (!any && !(next?.t === 'word' && (d.scales.has(next.w) || d.numbers.get(next.w) === 100))) break;
      v = weak;
    }
    if (v == null) break;
    if (v === 100 && current > 0 && current < 10) current *= 100; // "خمس مية"
    else current += v;
    any = true;
    if (weak == null) strong = true;
    j++;
  }
  if (!any || !strong) return null;
  const value = total + current;
  return value > 0 ? { i, end: j, value } : null;
}
function isNumberWord(w: string, allowWeak = false) {
  const d = D();
  return d.numbers.has(w) || d.scales.has(w) || (allowWeak && d.weak.has(w));
}

// ---------------------------------------------------------------- names (wallets, categories)

interface Named { id: ID; p: Phrase; pri: number; sub: boolean; kind?: CategoryKind }

function nameIndex(ctx: SmartContext) {
  const d = D();
  const active = ctx.wallets.filter((w) => !w.archived);
  const wallets: Named[] = [];
  for (const w of active) {
    const names = [w.name, ...(w.sysKey ? ctx.labels(w.sysKey) : [])].filter(Boolean);
    for (const p of phrases(names)) wallets.push({ id: w.id, p, pri: w.sysKey ? 1 : 0, sub: false });
    if (w.sysKey) for (const a of d.walletWords) if (a.sysKey === w.sysKey) wallets.push({ id: w.id, p: a.p, pri: 1, sub: false });
  }
  const cats = ctx.categories.filter((c) => !c.archived && c.sysKey !== 'adjustment_expense' && c.sysKey !== 'adjustment_income');
  const bySys = new Map(cats.filter((c) => c.sysKey).map((c) => [c.sysKey!, c]));
  const categories: Named[] = [];
  for (const c of cats) {
    // 1 = the user's own names (and renamed built-ins), 2 = dictionary, 3 = built-in display names
    if (c.name) for (const p of phrases([c.name])) categories.push({ id: c.id, p, pri: 1, sub: !!c.parentId, kind: c.kind });
    if (c.sysKey) for (const p of phrases(ctx.labels(c.sysKey))) categories.push({ id: c.id, p, pri: 3, sub: !!c.parentId, kind: c.kind });
  }
  // a dictionary word of an archived subcategory goes to its parent ("تاكسي" → نقل)
  const allBySys = new Map(ctx.categories.filter((c) => c.sysKey).map((c) => [c.sysKey!, c]));
  const target = (sysKey: string) => {
    const c = bySys.get(sysKey);
    if (c) return c;
    const parentId = allBySys.get(sysKey)?.parentId;
    return parentId ? cats.find((x) => x.id === parentId) : undefined;
  };
  for (const w of d.catWords) {
    const c = target(w.sysKey);
    if (c) categories.push({ id: c.id, p: w.p, pri: 2, sub: !!c.parentId, kind: c.kind });
  }
  const catById = new Map(cats.map((c) => [c.id, c]));
  return { active, wallets, categories, bySys, catById };
}

// ---------------------------------------------------------------- parse

export function parseDay(input: string, ctx: SmartContext): SmartResult {
  const d = D();
  const idx = nameIndex(ctx);
  const toks = tokenize(input);
  const entries: SmartEntry[] = [];
  const unknown: SmartSpan[] = [];
  let dayOffset = 0; // carried forward: "أمس: خبز 50، تاكسي 100" → both yesterday

  // 1. chunks between separators
  const chunks: Tok[][] = [[]];
  for (const tk of toks) {
    if (tk.t === 'sep') { if (chunks[chunks.length - 1].length) chunks.push([]); } else chunks[chunks.length - 1].push(tk);
  }

  const knownWord = (w: string) => forms(w).some((f) => d.known.has(f) || idx.wallets.some((x) => x.p[0] === f) || idx.categories.some((x) => x.p[0] === f) || !!ctx.rules[f]);

  for (const chunk of chunks) {
    if (!chunk.length) continue;
    // 2. amounts in the chunk
    const amounts: Amount[] = [];
    for (let i = 0; i < chunk.length; i++) {
      const a = readAmount(chunk, i);
      if (a) { amounts.push(a); i = a.end - 1; }
    }
    // 3. split the chunk so each segment has one amount
    const segments: Array<{ from: number; to: number; amount: Amount | null }> = [];
    if (!amounts.length) segments.push({ from: 0, to: chunk.length, amount: null });
    else {
      const amountFirst = chunk.slice(0, amounts[0].i).every((tk) => tk.t === 'sym' || d.filler.has(tk.w) || d.currency.has(tk.w));
      let from = 0;
      for (let k = 0; k < amounts.length; k++) {
        const a = amounts[k], b = amounts[k + 1];
        if (!b) { segments.push({ from, to: chunk.length, amount: a }); break; }
        let split = -1;
        // a conjunction between them: "و" alone, or "و" + a word the dictionary knows ("وتاكسي", "ودخلتني")
        for (let j = a.end; j < b.i; j++) {
          const w = chunk[j].w;
          if (chunk[j].t === 'word' && (w === 'و' || w === 'et' || (w.startsWith('و') && !knownWord(w) && knownWord(w.slice(1))) || (w.startsWith('و') && d.known.has(w.slice(1))))) { split = j; break; }
        }
        if (split < 0) {
          if (amountFirst) {
            split = b.i;
            if (split - 1 > a.end && (chunk[split - 1].t === 'sym' || d.currency.has(chunk[split - 1].w))) split--;
          } else split = trailingEnd(chunk, a.end, b.i, idx);
        }
        segments.push({ from, to: split, amount: a });
        from = split;
      }
    }

    // 4. read each segment
    for (const seg of segments) {
      const s = chunk.slice(seg.from, seg.to);
      if (!s.length) continue;
      const used = new Set<number>(); // indices within s
      if (seg.amount) for (let j = seg.amount.i - seg.from; j < seg.amount.end - seg.from; j++) used.add(j);

      // date words (carry forward)
      for (let j = 0; j < s.length; j++) {
        if (s[j].t !== 'word') continue;
        const two = d.dayBefore.find((p) => phraseAt(s, j, p) != null);
        if (two) { dayOffset = 2; used.add(j); used.add(j + 1); j++; continue; }
        const f = forms(s[j].w);
        const rel = f.map((x) => d.days.get(x)).find((v) => v != null);
        if (rel != null) { dayOffset = rel; used.add(j); continue; }
        const wd = f.map((x) => d.weekdays.get(x)).find((v) => v != null);
        if (wd != null) { dayOffset = (new Date(ctx.now).getDay() - wd + 7) % 7; used.add(j); }
      }

      // currency
      let code = ctx.baseCurrency, old = false;
      for (let j = 0; j < s.length; j++) {
        if (used.has(j)) continue;
        const c = forms(s[j].w).map((x) => d.currency.get(x)).find(Boolean);
        if (!c) continue;
        used.add(j);
        if (c === 'OLD') old = true;
        else if (c !== 'BASE') code = c;
      }

      // wallets, with their role (from / to)
      const mentions: Array<{ id: ID; role: 'from' | 'to' | null; word: string }> = [];
      for (let j = 0; j < s.length; j++) {
        if (used.has(j) || s[j].t !== 'word') continue;
        let best: { id: ID; len: number; form: string } | null = null;
        for (const x of idx.wallets) {
          const f = phraseAt(s, j, x.p);
          if (f != null && (!best || x.p.length > best.len)) best = { id: x.id, len: x.p.length, form: f };
        }
        if (!best) continue;
        const pre = prefixOf(s[j].w, best.form);
        const prev = j > 0 && !used.has(j - 1) ? s[j - 1].w : '';
        const role = /^(و?ب|و?بال)$/.test(pre) || d.from.has(prev) ? 'from' : /^(و?ل|و?لل)$/.test(pre) || d.to.has(prev) ? 'to' : null;
        if (d.from.has(prev) || d.to.has(prev)) used.add(j - 1);
        for (let k = 0; k < best.len; k++) used.add(j + k);
        mentions.push({ id: best.id, role, word: best.form });
        j += best.len - 1;
      }

      // verbs
      const verb = (list: Phrase[]) => {
        for (let j = 0; j < s.length; j++) {
          if (used.has(j)) continue;
          const m = anyPhraseAt(s, j, list);
          if (m) { for (let k = 0; k < m.len; k++) used.add(j + k); return true; }
        }
        return false;
      };
      const isTransfer = verb(d.transfer);
      const lent = verb(d.lent);
      const borrowed = !lent && verb(d.borrowed);
      const incomeVerb = verb(d.income);
      const expenseVerb = verb(d.expense);

      // category: learned word > the user's names > dictionary > built-in names; subcategory > parent
      let cat: { id: ID; pri: number; sub: boolean; len: number; form: string; j: number } | null = null;
      let ruleWallet: ID | undefined;
      for (let j = 0; j < s.length; j++) {
        if (used.has(j) || s[j].t !== 'word') continue;
        for (const f of forms(s[j].w)) {
          const r = ctx.rules[f];
          if (!r) continue;
          if (r.categoryId && idx.catById.has(r.categoryId) && (!cat || cat.pri > 0)) cat = { id: r.categoryId, pri: 0, sub: true, len: 1, form: f, j };
          if (r.walletId && idx.active.some((w) => w.id === r.walletId)) ruleWallet ??= r.walletId;
        }
        for (const x of idx.categories) {
          const f = phraseAt(s, j, x.p);
          if (f == null) continue;
          const better = !cat || x.pri < cat.pri || (x.pri === cat.pri && (x.p.length > cat.len || (x.p.length === cat.len && x.sub && !cat.sub)));
          if (better) cat = { id: x.id, pri: x.pri, sub: x.sub, len: x.p.length, form: f, j };
        }
      }
      if (cat) for (let k = 0; k < cat.len; k++) used.add(cat.j + k);
      const catObj = cat ? idx.catById.get(cat.id) : undefined;

      // what's left: the person of a debt, or words we don't know
      const rest: Tok[] = [];
      for (let j = 0; j < s.length; j++) if (!used.has(j) && s[j].t === 'word' && !d.filler.has(s[j].w)) rest.push(s[j]);
      const text = sliceText(input, s);

      if (!seg.amount) {
        if (rest.length || cat) unknown.push(text);
        continue;
      }

      // kind
      let kind: SmartKind = 'expense';
      let direction: DebtDirection | undefined;
      if (isTransfer && (mentions.length >= 2 || mentions.some((m) => m.role === 'to'))) kind = 'transfer';
      else if (lent) { kind = 'debt'; direction = 'owed_to_me'; }
      else if (borrowed) { kind = 'debt'; direction = 'i_owe'; }
      else if (incomeVerb) kind = 'income';
      else if (expenseVerb) kind = 'expense';
      else if (catObj?.kind === 'income') kind = 'income';

      // amount and currency
      const warnings: SmartWarning[] = [];
      let minor = Math.round(seg.amount.value * 100);
      if (old) { minor = Math.round(minor / 10); warnings.push('oldOuguiya'); }
      const e: SmartEntry = {
        key: '', kind, amount: minor, walletId: '', date: 0, text: text.text, start: text.start, end: text.end, warnings,
      };
      if (code !== ctx.baseCurrency && kind !== 'transfer' && kind !== 'debt') {
        const rate = ctx.lastRates[code];
        e.origCurrency = code;
        e.origAmount = minor;
        if (rate) { e.rateE4 = rate; e.amount = toBase(minor, rate); warnings.push('foreign'); } else { e.amount = 0; warnings.push('noRate'); }
      }

      // wallets
      const def = ctx.defaultWalletId && idx.active.some((w) => w.id === ctx.defaultWalletId) ? ctx.defaultWalletId : idx.active[0]?.id ?? '';
      if (kind === 'transfer') {
        const fromM = mentions.find((m) => m.role === 'from') ?? mentions.find((m) => m.role !== 'to');
        const toM = mentions.find((m) => m.role === 'to' && m !== fromM) ?? mentions.find((m) => m !== fromM);
        e.walletId = fromM?.id ?? (def !== toM?.id ? def : idx.active.find((w) => w.id !== toM?.id)?.id ?? '');
        e.toWalletId = toM?.id ?? idx.active.find((w) => w.id !== e.walletId)?.id;
        if (!fromM || !toM) warnings.push('checkWallets');
        e.walletWord = fromM?.word;
      } else {
        e.walletId = mentions[0]?.id ?? ruleWallet ?? def;
        e.walletWord = mentions[0]?.word;
      }

      // category / person
      if (kind === 'expense' || kind === 'income') {
        const fits = catObj && catObj.kind === kind;
        const fallback = idx.bySys.get(kind === 'income' ? 'other_income' : 'other_expense');
        e.categoryId = fits ? catObj!.id : kind === 'income' && cat ? incomeFor(cat.form, idx) ?? fallback?.id : fallback?.id;
        if (!fits) warnings.push('noCategory');
      } else if (kind === 'debt') {
        e.direction = direction;
        e.person = rest.map((tk) => stripTo(tk.raw)).join(' ').trim();
        warnings.push('debt');
        if (!e.person) warnings.push('noPerson');
      }
      e.keyword = cat?.form ?? (rest[0] ? forms(rest[0].w).at(-1) : undefined);

      // date: today = now; an earlier day at noon (keeps the order of the entries)
      e.date = dayOffset === 0 ? ctx.now : +startOfDay(subDays(ctx.now, dayOffset)) + 12 * 3_600_000 + entries.length * 60_000;
      e.key = `${e.start}:${n(e.text)}`;
      entries.push(e);
    }
  }
  return { entries, unknown };
}

/** An income word that is also an expense-category word (e.g. "هدية" with "جاتني"): the income category of that word. */
function incomeFor(form: string, idx: ReturnType<typeof nameIndex>): ID | undefined {
  const x = idx.categories.find((c) => c.kind === 'income' && c.p.length === 1 && c.p[0] === form);
  return x?.id;
}

/** After amount `a`: its currency, "من بنكيلي", date words… belong to it; the next entry starts after. */
function trailingEnd(chunk: Tok[], from: number, limit: number, idx: ReturnType<typeof nameIndex>): number {
  const d = D();
  let j = from;
  while (j < limit) {
    const tk = chunk[j];
    const f = forms(tk.w);
    const isWallet = (k: number) => k < limit && idx.wallets.some((x) => phraseAt(chunk, k, x.p) != null);
    if (tk.t === 'sym' || f.some((x) => d.currency.has(x) || d.days.has(x) || d.weekdays.has(x))) { j++; continue; }
    if ((d.from.has(tk.w) || d.to.has(tk.w)) && isWallet(j + 1)) { j += 2; continue; }
    if (isWallet(j)) { j++; continue; }
    break;
  }
  return Math.max(from, Math.min(j, limit));
}

/** "لأحمد" → "أحمد" (ل + alef is "to"); other words are kept as typed. */
function stripTo(raw: string): string {
  return /^ل[اأإآ]/.test(raw) ? raw.slice(1) : raw;
}

function sliceText(text: string, s: Tok[]): SmartSpan {
  const start = s[0].start, end = s[s.length - 1].end;
  return { text: text.slice(start, end), start, end };
}
