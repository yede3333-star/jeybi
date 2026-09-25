// Upgrade of a real phase-1 database. The fixture was produced by the `phase1-stable` code itself
// (demo data + splits, transfers with fees, templates, trash, edits with history, a receipt image,
// settings with a PIN), dumped raw from IndexedDB together with the balances/totals it computed.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { db, SCHEMA_V1 } from '../data/db';
import type { Transaction } from '../data/types';
import { initDatabase } from '../repo/init';
import { getSettings } from '../repo/settings';
import { getBalances } from '../repo/summary';
import { computeFlows, FLOWS_KEY } from '../repo/flows';
import { exportBackup, parseBackup, restoreBackup } from '../repo/backup';
import { listActive, listDeleted } from '../repo/transactions';
import { historyOf } from '../repo/audit';
import { buildReport, totalsFor, walletBalances } from '../services/reports';
import { periodFor, previousPeriod } from '../lib/period';
import phase1 from './fixtures/phase1-db.json';
import phase1Backup from './fixtures/phase1-backup.json';

type Dump = typeof phase1;
const expected = phase1.expected;

// The expected month/week/year totals are what phase 1 showed in the user's time zone (Nouakchott,
// UTC+0); calendar periods depend on the zone, so compare in that zone even when CI runs elsewhere.
// (the app tsconfig has no Node types: reach process.env without them)
const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;
const originalTz = env.TZ;
beforeAll(() => { env.TZ = 'Africa/Nouakchott'; });
afterAll(() => { if (originalTz === undefined) delete env.TZ; else env.TZ = originalTz; });

/** Recreates the phase-1 database exactly as it exists on a phone, then lets the app open it. */
async function loadPhase1Database(dump: Dump) {
  db.close();
  await Dexie.delete('jeybi');
  const old = new Dexie('jeybi');
  old.version(1).stores(SCHEMA_V1);
  await old.open();
  const t = dump.tables;
  await old.table('wallets').bulkAdd(t.wallets);
  await old.table('categories').bulkAdd(t.categories);
  await old.table('transactions').bulkAdd(t.transactions);
  await old.table('templates').bulkAdd(t.templates);
  await old.table('audit').bulkAdd(t.audit);
  await old.table('meta').bulkAdd(t.meta);
  await old.table('receipts').bulkAdd(t.receipts.map(({ base64, ...r }) => ({ ...r, blob: new Blob([Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0))], { type: r.mime }) })));
  expect(old.verno).toBe(1);
  old.close();
  await db.open(); // ← runs the v1 → v2 upgrade
  await initDatabase(); // what the app does on every open
}

async function figures() {
  const txs = await db.transactions.toArray();
  const wallets = await db.wallets.toArray();
  const cats = await db.categories.toArray();
  const month = periodFor('month', expected.now, 6);
  const r = buildReport(wallets, cats, txs, month, previousPeriod(month, 6));
  return {
    balances: Object.fromEntries(walletBalances(wallets, txs)),
    totals: {
      month: totalsFor(txs, month),
      year: totalsFor(txs, periodFor('year', expected.now, 6)),
      week: totalsFor(txs, periodFor('week', expected.now, 6)),
    },
    report: {
      openingBalance: r.openingBalance,
      closingBalance: r.closingBalance,
      expenseByCategory: r.expenseByCategory.map((s) => [s.categoryId, s.amount]),
      incomeByCategory: r.incomeByCategory.map((s) => [s.categoryId, s.amount]),
    },
  };
}

describe('phase 1 → phase 2 database migration', () => {
  beforeEach(async () => {
    await loadPhase1Database(phase1);
  });

  it('upgrades to schema version 2', () => {
    expect(db.verno).toBe(2);
    expect(phase1.schemaVersion).toBe(1);
  });

  it('keeps every phase-1 row byte for byte', async () => {
    const t = phase1.tables;
    const byId = <T extends { id: string }>(rows: T[]) => [...rows].sort((a, b) => a.id.localeCompare(b.id));
    expect(byId(await db.transactions.toArray())).toEqual(byId(t.transactions as Transaction[]));
    expect(byId(await db.wallets.toArray())).toEqual(byId(t.wallets));
    expect(byId(await db.templates.toArray())).toEqual(byId(t.templates as never));
    expect(await db.audit.orderBy('seq').toArray()).toEqual(t.audit);
    for (const m of t.meta) if (m.key !== FLOWS_KEY) expect((await db.meta.get(m.key))?.value).toEqual(m.value);
    const r = (await db.receipts.toArray())[0];
    expect(btoa(String.fromCharCode(...new Uint8Array(await r.blob.arrayBuffer())))).toBe(t.receipts[0].base64);
    // categories: all old ones unchanged + only the 3 new system ones
    const cats = await db.categories.toArray();
    for (const c of t.categories) expect(cats.find((x) => x.id === c.id)).toEqual(c);
    expect(cats.length).toBe(t.categories.length + 3);
    expect(cats.filter((c) => !t.categories.some((o) => o.id === c.id)).map((c) => c.sysKey).sort())
      .toEqual(['adjustment_expense', 'adjustment_income', 'zakat']);
  });

  it('balances, totals and report figures are identical to phase 1', async () => {
    expect(await figures()).toEqual({ balances: expected.balances, totals: expected.totals, report: expected.report });
    // and the cached balances used by the home screen agree
    const { byWallet } = await getBalances();
    expect(Object.fromEntries(byWallet)).toEqual(expected.balances);
    const nz = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== 0));
    expect(nz((await db.meta.get(FLOWS_KEY))!.value as Record<string, number>)).toEqual(nz(await computeFlows()));
  });

  it('trash, history, settings and PIN survive', async () => {
    expect((await listActive()).length).toBe(expected.activeCount);
    expect((await listDeleted()).length).toBe(expected.deletedCount);
    const edited = phase1.tables.transactions.find((x) => x.note === 'تاكسي المطار')!;
    expect((await historyOf(edited.id)).map((h) => h.action)).toEqual(['create', 'update']);
    const s = await getSettings();
    expect(s).toMatchObject({ pinHash: 'phase1-hash', pinIterations: 210000, pinCalibrated: false, weekStartsOn: 6, onboarded: true, lang: 'ar' });
  });

  it('is idempotent: opening again changes nothing', async () => {
    const before = { cats: await db.categories.count(), fig: await figures() };
    db.close();
    await db.open();
    await initDatabase();
    expect(await db.categories.count()).toBe(before.cats);
    expect(await figures()).toEqual(before.fig);
  });

  it('a phase-2 backup of the migrated data restores to the same figures', async () => {
    const file = JSON.parse(JSON.stringify(await exportBackup()));
    expect(file.format).toBe(2);
    await restoreBackup(parseBackup(JSON.stringify(file)).file);
    expect(await figures()).toEqual({ balances: expected.balances, totals: expected.totals, report: expected.report });
  });
});

describe('importing a phase-1 backup file', () => {
  it('is accepted and restores every figure', async () => {
    await loadPhase1Database(phase1); // any current state
    const { file, preview } = parseBackup(JSON.stringify(phase1Backup));
    expect(preview.format).toBe(1);
    expect(preview.transactions).toBe(expected.activeCount);
    await restoreBackup(file);
    expect(await figures()).toEqual({ balances: expected.balances, totals: expected.totals, report: expected.report });
    const cats = await db.categories.toArray();
    expect(cats.filter((c) => ['zakat', 'adjustment_expense', 'adjustment_income'].includes(c.sysKey ?? ''))).toHaveLength(3);
    expect(await db.receipts.count()).toBe(1);
    expect(await db.debts.count()).toBe(0);
  });
});
