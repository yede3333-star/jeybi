// "اكتب يومك": write the day in one sentence, review the entries it gives, then save them all.
// Nothing is saved before "حفظ الكل". The parser + dictionary are in this page's chunk only.
import { lazy, Suspense, useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeftRight, CheckCheck, HandCoins, Loader2, Mic, Pencil, Plus, Sparkles, Trash2, TriangleAlert, TrendingDown, TrendingUp } from 'lucide-react';
import { PageHeader, Segmented, Sheet } from '../components/ui';
import { WalletChips } from '../components/pickers';
import { useToast } from '../components/Toast';
import { useNames } from '../hooks/data';
import { useFmt } from '../hooks/fmt';
import { useLang, useSettings } from '../hooks/settings';
import { useDayKey } from '../hooks/day';
import i18n from '../i18n';
import { parseDay, BLOCKING, type SmartEntry as Parsed, type SmartWarning } from '../services/smartParse';
import { learnRule, saveSmartEntries, type SmartDraft } from '../repo/smart';
import type { TxInput } from '../repo/transactions';
import type { DebtInput } from '../repo/debts';
import type { DebtDirection, ID } from '../data/types';
import { errorMessage } from '../services/errors';
import { listen, speechAvailable, type SpeechFailure } from '../services/speech';
import { isNative, takeSharedText } from '../platform';
import { minorToKeypad, parseAmount } from '../lib/money';
import { logError } from '../services/errorLog';

const TxSheet = lazy(() => import('../components/TxSheet'));
const DRAFT_KEY = 'jeybi:smart-draft';

/** A card: what the parser read (or a manual entry), possibly edited by the user. */
interface Card {
  key: string;
  draft: SmartDraft;
  text: string;
  warnings: SmartWarning[];
  source?: Parsed;
}
type Override = { draft: SmartDraft } | { deleted: true };

function toDraft(e: Parsed): SmartDraft {
  if (e.kind === 'debt') {
    return { kind: 'debt', input: { direction: e.direction!, person: e.person ?? '', amount: e.amount, date: e.date, dueDate: null, note: e.text, walletId: e.walletId || null } };
  }
  const input: TxInput = { type: e.kind, amount: e.amount, walletId: e.walletId, date: e.date, note: e.text };
  if (e.kind === 'transfer') input.toWalletId = e.toWalletId;
  else input.categoryId = e.categoryId;
  if (e.origCurrency) Object.assign(input, { origCurrency: e.origCurrency, origAmount: e.origAmount, rateE4: e.rateE4 });
  return { kind: 'tx', input };
}

/** Why a card cannot be saved yet (null = fine). */
function problem(d: SmartDraft): SmartWarning | 'amount' | null {
  if (d.kind === 'debt') return !d.input.person.trim() ? 'noPerson' : d.input.amount > 0 ? null : 'amount';
  const i = d.input;
  if (i.origCurrency && !i.rateE4) return 'noRate';
  if (!(i.amount > 0)) return 'amount';
  if (i.type === 'transfer' && (!i.toWalletId || i.toWalletId === i.walletId)) return 'checkWallets';
  return null;
}

const readDraft = () => { try { return localStorage.getItem(DRAFT_KEY) ?? ''; } catch { return ''; } };
const writeDraft = (v: string) => { try { if (v) localStorage.setItem(DRAFT_KEY, v); else localStorage.removeItem(DRAFT_KEY); } catch { /* storage blocked */ } };

export default function SmartEntry() {
  const { t } = useTranslation();
  const lang = useLang();
  const s = useSettings();
  const toast = useToast();
  const nav = useNavigate();
  const day = useDayKey();
  const { categories, wallets, walletName, categoryName, ready } = useNames();
  const [text, setText] = useState(() => takeSharedText() ?? readDraft());
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [manual, setManual] = useState<Card[]>([]);
  const [handled, setHandled] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<{ card: Card; manualNew?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [mic, setMic] = useState<'hidden' | 'idle' | 'listening'>('hidden');
  const deferred = useDeferredValue(text);

  useEffect(() => writeDraft(text), [text]);
  // A text shared while this screen is open
  useEffect(() => {
    const on = () => { const v = takeSharedText(); if (v) setText((cur) => (cur.trim() ? `${cur.trim()}\n${v}` : v)); };
    window.addEventListener('jeybi:shared-text', on);
    return () => window.removeEventListener('jeybi:shared-text', on);
  }, []);
  useEffect(() => { void speechAvailable().then((ok) => setMic(ok ? 'idle' : 'hidden')); }, []);

  // ---- parse (instant: every keystroke, deferred so typing stays smooth)
  const result = useMemo(() => {
    if (!ready || !deferred.trim()) return { entries: [], unknown: [] };
    const ar = i18n.getFixedT('ar'), fr = i18n.getFixedT('fr');
    return parseDay(deferred, {
      categories: categories ?? [], wallets: wallets ?? [], labels: (k) => [ar(`sys.${k}`), fr(`sys.${k}`)],
      defaultWalletId: s.lastWalletId, baseCurrency: s.currency, lastRates: s.lastRates, rules: s.smartRules, now: Date.now(),
    });
    // `day`: a new day re-reads "today" / "yesterday"
  }, [deferred, ready, categories, wallets, s.lastWalletId, s.currency, s.lastRates, s.smartRules, day]); // eslint-disable-line react-hooks/exhaustive-deps

  const cards = useMemo<Card[]>(() => {
    const out: Card[] = [];
    for (const e of result.entries) {
      const o = overrides[e.key];
      if (o && 'deleted' in o) continue;
      out.push(o ? { key: e.key, draft: o.draft, text: e.text, warnings: [], source: e } : { key: e.key, draft: toDraft(e), text: e.text, warnings: e.warnings, source: e });
    }
    return [...out, ...manual];
  }, [result, overrides, manual]);
  const unknown = result.unknown.filter((u) => !handled.has(`${u.start}:${u.text}`));
  const invalid = cards.filter((c) => problem(c.draft) || c.warnings.some((w) => BLOCKING.includes(w)));

  // ---- edits (and learning from them)
  const applyEdit = useCallback((card: Card, draft: SmartDraft, manualNew?: boolean) => {
    if (manualNew || card.key.startsWith('m:')) {
      setManual((m) => (m.some((c) => c.key === card.key) ? m.map((c) => (c.key === card.key ? { ...c, draft, warnings: [] } : c)) : [...m, { ...card, draft, warnings: [] }]));
      return;
    }
    setOverrides((o) => ({ ...o, [card.key]: { draft } }));
    const e = card.source;
    if (!e || draft.kind !== 'tx' || (e.kind !== 'expense' && e.kind !== 'income')) return;
    const cat = draft.input.splits?.length ? undefined : draft.input.categoryId;
    const learned: string[] = [];
    if (cat && cat !== e.categoryId && e.keyword) { void learnRule(e.keyword, { categoryId: cat }); learned.push(`${e.keyword} ← ${categoryName(cat)}`); }
    const wordForWallet = e.walletWord ?? e.keyword;
    if (draft.input.walletId !== e.walletId && wordForWallet) { void learnRule(wordForWallet, { walletId: draft.input.walletId }); learned.push(`${wordForWallet} ← ${walletName(draft.input.walletId)}`); }
    if (learned.length) toast({ message: t('smart.learned', { what: learned.join('، ') }) });
  }, [categoryName, walletName, t, toast]);

  const remove = (card: Card) => {
    if (card.key.startsWith('m:')) setManual((m) => m.filter((c) => c.key !== card.key));
    else setOverrides((o) => ({ ...o, [card.key]: { deleted: true } }));
  };

  const addManual = (u: { text: string; start: number }) => {
    const card: Card = {
      key: `m:${Date.now()}`, text: u.text, warnings: [],
      draft: { kind: 'tx', input: { type: 'expense', amount: 0, walletId: s.lastWalletId ?? wallets?.find((w) => !w.archived)?.id ?? '', date: Date.now(), note: u.text } },
    };
    setHandled((h) => new Set(h).add(`${u.start}:${u.text}`));
    setEditing({ card, manualNew: true });
  };

  // ---- voice
  const speak = async () => {
    setMic('listening');
    try {
      const heard = (await listen(lang)).trim();
      if (heard) setText((cur) => (cur.trim() ? `${cur.trim()}، ${heard}` : heard));
    } catch (e) {
      const code = (e as { code?: SpeechFailure }).code ?? 'other';
      if (code === 'other') logError(e, 'speech');
      if (code !== 'cancelled') toast({ message: t(`smart.speech.${code}`), tone: 'error', duration: 6000 });
    } finally {
      setMic('idle');
    }
  };

  // ---- save all
  const saveAll = async () => {
    if (!cards.length || invalid.length) return;
    setBusy(true);
    try {
      const { count, undo } = await saveSmartEntries(cards.map((c) => c.draft), text.trim());
      setText('');
      setOverrides({});
      setManual([]);
      setHandled(new Set());
      toast({ message: t('smart.saved', { n: count }), undo });
      nav('/');
    } catch (e) {
      toast({ message: errorMessage(e, t, 'smart:save'), tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader back title={t('smart.title')} />
      <div className="space-y-4 px-4 pb-8">
        <div className="card p-3">
          <textarea
            className="block min-h-32 w-full resize-y bg-transparent text-lg leading-relaxed outline-none placeholder:text-muted/70"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('smart.placeholder')}
            aria-label={t('smart.title')}
            dir="auto"
          />
          <div className="mt-2 flex items-center gap-2">
            {mic !== 'hidden' && (
              <button type="button" className={`btn-soft size-12 rounded-full p-0 ${mic === 'listening' ? 'animate-pulse' : ''}`} onClick={speak} disabled={mic === 'listening'} aria-label={t('smart.speak')}>
                {mic === 'listening' ? <Loader2 className="size-5 animate-spin" /> : <Mic className="size-5" />}
              </button>
            )}
            <span className="flex-1 text-xs text-muted">{t(mic === 'listening' ? 'smart.listening' : 'smart.hint')}</span>
            {text && <button type="button" className="btn-ghost min-h-10 px-3 text-sm" onClick={() => { setText(''); setOverrides({}); setManual([]); setHandled(new Set()); }}>{t('smart.clear')}</button>}
            <button type="button" className="btn-soft min-h-10 px-3 text-sm" onClick={() => (document.activeElement as HTMLElement | null)?.blur()}>
              <Sparkles className="size-4" />{t('smart.analyze')}
            </button>
          </div>
        </div>

        {deferred.trim() && <Highlight text={deferred} entries={result.entries} unknown={result.unknown} />}

        {unknown.length > 0 && (
          <div className="space-y-2">
            <h2 className="section-title pt-0">{t('smart.notUnderstood')}</h2>
            {unknown.map((u) => (
              <div key={`${u.start}:${u.text}`} className="flex items-center gap-2 rounded-xl bg-amber-100 px-3 py-2 text-amber-900 dark:bg-amber-400/15 dark:text-amber-200">
                <TriangleAlert className="size-4 shrink-0" />
                <bdi className="min-w-0 flex-1 truncate">{u.text}</bdi>
                <button type="button" className="rounded-lg bg-white/60 px-2.5 py-1.5 text-sm font-semibold dark:bg-white/10" onClick={() => addManual(u)}>
                  <Plus className="inline size-4" /> {t('smart.addAsEntry')}
                </button>
              </div>
            ))}
          </div>
        )}

        {cards.length > 0 && (
          <div className="space-y-2">
            <h2 className="section-title pt-0">{t('smart.entries', { n: cards.length })}</h2>
            {cards.map((c) => (
              <CardView key={c.key} card={c} onEdit={() => setEditing({ card: c })} onDelete={() => remove(c)} />
            ))}
          </div>
        )}

        {!text.trim() && <Examples onPick={setText} />}
      </div>

      {cards.length > 0 && (
        <div className="safe-bottom fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md border-t border-line bg-page/95 px-4 py-3 backdrop-blur">
          {invalid.length > 0 && <p className="mb-2 text-center text-sm font-semibold text-expense">{t('smart.fixFirst', { n: invalid.length })}</p>}
          <button className="btn-primary w-full text-lg" disabled={busy || invalid.length > 0} onClick={saveAll}>
            {busy ? <Loader2 className="size-5 animate-spin" /> : <CheckCheck className="size-5" />}{t('smart.saveAll', { n: cards.length })}
          </button>
        </div>
      )}

      {editing?.card.draft.kind === 'tx' && (
        <Suspense fallback={null}>
          <TxSheet
            initialType={editing.card.draft.input.type as 'expense' | 'income' | 'transfer'}
            draft={editing.card.draft.input}
            onDraft={(input) => applyEdit(editing.card, { kind: 'tx', input }, editing.manualNew)}
            onClose={() => setEditing(null)}
          />
        </Suspense>
      )}
      {editing?.card.draft.kind === 'debt' && (
        <DebtDraftSheet
          value={editing.card.draft.input}
          onSave={(input) => { applyEdit(editing.card, { kind: 'debt', input }); setEditing(null); }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

/** The text again, with what was understood (green) and what wasn't (amber). */
function Highlight({ text, entries, unknown }: { text: string; entries: Parsed[]; unknown: Array<{ start: number; end: number }> }) {
  const { t } = useTranslation();
  const marks = [
    ...entries.map((e) => ({ start: e.start, end: e.end, ok: true })),
    ...unknown.map((u) => ({ start: u.start, end: u.end, ok: false })),
  ].sort((a, b) => a.start - b.start);
  if (!marks.length) return null;
  const parts: Array<{ s: string; ok?: boolean }> = [];
  let at = 0;
  for (const m of marks) {
    if (m.start < at) continue;
    if (m.start > at) parts.push({ s: text.slice(at, m.start) });
    parts.push({ s: text.slice(m.start, m.end), ok: m.ok });
    at = m.end;
  }
  if (at < text.length) parts.push({ s: text.slice(at) });
  return (
    <p className="whitespace-pre-wrap rounded-xl bg-black/[0.03] p-3 text-sm leading-7 dark:bg-white/[0.04]" dir="auto" aria-label={t('smart.understood')}>
      {parts.map((p, i) => (
        <span key={i} className={p.ok === true ? 'rounded bg-emerald-600/10 text-income underline decoration-emerald-600/40 underline-offset-4' : p.ok === false ? 'rounded bg-amber-200/70 text-amber-950 dark:bg-amber-400/25 dark:text-amber-100' : 'text-muted'}>{p.s}</span>
      ))}
    </p>
  );
}

function CardView({ card, onEdit, onDelete }: { card: Card; onEdit: () => void; onDelete: () => void }) {
  const { t } = useTranslation();
  const fmt = useFmt();
  const { walletName, categoryName } = useNames();
  const d = card.draft;
  const issue = problem(d);
  let icon, title, color, sub;
  if (d.kind === 'debt') {
    icon = <HandCoins className="size-5" />;
    color = 'text-transfer';
    title = t(d.input.direction === 'owed_to_me' ? 'debts.label.lentTo' : 'debts.label.borrowedFrom', { person: d.input.person || '…' });
    sub = `${t('types.debt')} · ${d.input.walletId ? walletName(d.input.walletId) : '—'}`;
  } else {
    const i = d.input;
    icon = i.type === 'income' ? <TrendingUp className="size-5" /> : i.type === 'transfer' ? <ArrowLeftRight className="size-5" /> : <TrendingDown className="size-5" />;
    color = i.type === 'income' ? 'text-income' : i.type === 'transfer' ? 'text-transfer' : 'text-expense';
    title = i.type === 'transfer' ? `${walletName(i.walletId)} ← ${walletName(i.toWalletId)}`
      : i.splits?.length ? i.splits.map((x) => categoryName(x.categoryId)).join(' + ') : categoryName(i.categoryId);
    sub = `${t(`types.${i.type}`)}${i.type === 'transfer' ? '' : ` · ${walletName(i.walletId)}`}`;
  }
  const amount = d.input.amount;
  const orig = d.kind === 'tx' && d.input.origCurrency ? `${minorToKeypad(d.input.origAmount ?? 0)} ${d.input.origCurrency}` : null;
  const warnings = [...card.warnings.filter((w) => w !== 'noRate' && w !== 'noPerson' && w !== 'checkWallets'), ...(issue ? [issue] : [])];
  return (
    <div className={`card flex gap-3 p-3 ${issue ? 'ring-2 ring-red-500/50' : ''}`}>
      <button type="button" className="flex min-w-0 flex-1 gap-3 text-start" onClick={onEdit}>
        <span className={`mt-0.5 ${color}`}>{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate font-semibold">{title}</span>
            <span className={`num shrink-0 font-bold ${color}`}>{amount > 0 ? fmt.money(amount) : '—'}</span>
          </span>
          <span className="block text-sm text-muted">{sub} · {fmt.dayLabel(d.input.date)}{orig && <> · <bdi dir="ltr" className="num">{orig}</bdi></>}</span>
          <span className="block truncate text-xs text-muted">«<bdi>{card.text}</bdi>»</span>
          {warnings.map((w) => (
            <span key={w} className={`mt-1 flex items-center gap-1 text-xs font-semibold ${w === issue ? 'text-expense' : 'text-amber-700 dark:text-amber-300'}`}>
              <TriangleAlert className="size-3.5 shrink-0" />{t(`smart.warn.${w}`)}
            </span>
          ))}
        </span>
      </button>
      <div className="flex flex-col gap-1">
        <button type="button" className="btn-ghost size-10 min-h-10 rounded-full p-0" onClick={onEdit} aria-label={t('common.edit')}><Pencil className="size-4" /></button>
        <button type="button" className="btn-ghost size-10 min-h-10 rounded-full p-0 text-expense" onClick={onDelete} aria-label={t('common.delete')}><Trash2 className="size-4" /></button>
      </div>
    </div>
  );
}

/** Debts are edited here (the transaction editor does not handle them). */
function DebtDraftSheet({ value, onSave, onClose }: { value: DebtInput; onSave: (v: DebtInput) => void; onClose: () => void }) {
  const { t } = useTranslation();
  const { wallets } = useNames();
  const [direction, setDirection] = useState<DebtDirection>(value.direction);
  const [person, setPerson] = useState(value.person);
  const [amount, setAmount] = useState(minorToKeypad(value.amount));
  const [walletId, setWalletId] = useState<ID | undefined>(value.walletId ?? undefined);
  const minor = parseAmount(amount) ?? 0;
  return (
    <Sheet open onClose={onClose} title={t('smart.editDebt')}
      footer={<button className="btn-primary w-full" disabled={!person.trim() || minor <= 0} onClick={() => onSave({ ...value, direction, person: person.trim(), amount: minor, walletId: walletId ?? null })}>{t('common.save')}</button>}>
      <div className="space-y-4">
        <Segmented<DebtDirection> value={direction} onChange={setDirection}
          options={[{ value: 'owed_to_me', label: t('debts.lend') }, { value: 'i_owe', label: t('debts.borrow') }]} />
        <div>
          <label className="label" htmlFor="dperson">{t('debts.person')}</label>
          <input id="dperson" className="input" value={person} onChange={(e) => setPerson(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="damount">{t('tx.amount')}</label>
          <input id="damount" className="input num" dir="ltr" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div>
          <span className="label">{t('tx.wallet')}</span>
          <WalletChips wallets={wallets ?? []} value={walletId} onChange={setWalletId} />
        </div>
      </div>
    </Sheet>
  );
}

function Examples({ onPick }: { onPick: (s: string) => void }) {
  const { t } = useTranslation();
  const list = t('smart.examples', { returnObjects: true }) as string[];
  return (
    <div className="space-y-2">
      <h2 className="section-title pt-0">{t('smart.examplesTitle')}</h2>
      {list.map((ex) => (
        <button key={ex} type="button" className="card block w-full p-3 text-start text-sm" onClick={() => onPick(ex)}><bdi>{ex}</bdi></button>
      ))}
      {isNative && <p className="px-1 text-xs text-muted">{t('smart.shareHint')}</p>}
    </div>
  );
}
