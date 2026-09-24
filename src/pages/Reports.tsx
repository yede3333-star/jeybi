import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { ChevronDown, FileSpreadsheet, FileText, HelpCircle, Share2, TrendingDown, TrendingUp } from 'lucide-react';
import type { CategoryKind, ID } from '../data/types';
import { PageHeader, Empty } from '../components/ui';
import { PeriodNav, usePeriod } from '../components/PeriodNav';
import { ReportPrint } from '../components/ReportPrint';
import { TxRow } from '../components/TxRow';
import { IconBadge } from '../components/Icon';
import { useNames, useTransactions } from '../hooks/data';
import { useFmt, type Formatters } from '../hooks/fmt';
import { buildReport, filterTransactions, type CategorySlice, type Report } from '../services/reports';
import { periodLabel, periodToParams, toDay } from '../lib/periodParams';
import type { Period } from '../lib/period';
import { useFileShare } from '../components/FileShare';
import { stripBidi } from '../lib/money';
import { ReportExtras, extrasSheets, useReportExtras } from '../components/ReportExtras';

/** Link to the transactions that make up a figure. */
function txLink(p: Period, extra: Record<string, string>) {
  const q = new URLSearchParams({ from: toDay(p.start), to: toDay(p.end - 1), ...extra });
  return `/transactions?${q}`;
}

function Change({ value, invert = false }: { value: number | null; invert?: boolean }) {
  const { t } = useTranslation();
  const fmt = useFmt();
  if (value == null) return <span className="text-xs text-muted">{t('reports.noPrevious')}</span>;
  const up = value > 0;
  const good = invert ? !up : up;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${value === 0 ? 'text-muted' : good ? 'text-income' : 'text-expense'}`}>
      {value !== 0 && <Icon className="size-3.5" />}
      <span className="num">{fmt.pct(Math.abs(value))}</span>
    </span>
  );
}

function Breakdown({ slices, kind, period, fmt }: { slices: CategorySlice[]; kind: CategoryKind; period: Period; fmt: Formatters }) {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { category, categoryName } = useNames();
  const [open, setOpen] = useState<ID | null>(null);
  if (!slices.length) return <p className="p-4 text-center text-sm text-muted">{t('reports.nothing')}</p>;
  const data = slices.map((s) => ({ id: s.categoryId, name: categoryName(s.categoryId), value: s.amount, color: category(s.categoryId)?.color ?? '#94a3b8' }));
  const total = slices.reduce((a, s) => a + s.amount, 0);
  return (
    <div>
      <div className="relative mx-auto h-52 w-52" dir="ltr">
        <ResponsiveContainer>
          <PieChart>
            <Pie data={data} dataKey="value" innerRadius="62%" outerRadius="100%" paddingAngle={1} stroke="none" isAnimationActive={false}
              onClick={(d) => nav(txLink(period, { c: (d as unknown as { id: string }).id, type: kind }))}>
              {data.map((d) => <Cell key={d.id} fill={d.color} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-xs text-muted">{t('reports.total')}</span>
          <span className="num text-lg font-bold">{fmt.money(total)}</span>
        </div>
      </div>
      <div className="mt-3 divide-y divide-line">
        {slices.map((s) => {
          const c = category(s.categoryId);
          const hasKids = s.children.length > 1 || (s.children.length === 1 && s.children[0].categoryId !== s.categoryId);
          const isOpen = open === s.categoryId;
          return (
            <div key={s.categoryId}>
              <div className="flex min-h-14 items-center gap-2">
                <button className="flex flex-1 items-center gap-3 py-2 text-start" onClick={() => (hasKids ? setOpen(isOpen ? null : s.categoryId) : nav(txLink(period, { c: s.categoryId, type: kind })))}>
                  <IconBadge name={c?.icon ?? 'tag'} color={c?.color ?? '#94a3b8'} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1 font-semibold">{categoryName(s.categoryId)}{hasKids && <ChevronDown className={`size-4 transition ${isOpen ? 'rotate-180' : ''}`} />}</span>
                    <span className="mt-1 block h-1.5 rounded-full bg-black/5 dark:bg-white/10"><span className="block h-1.5 rounded-full" style={{ width: `${s.pct}%`, backgroundColor: c?.color }} /></span>
                  </span>
                </button>
                <Link to={txLink(period, { c: s.categoryId, type: kind })} className="w-32 text-end">
                  <span className="num block font-bold">{fmt.money(s.amount)}</span>
                  <span className="num block text-xs text-muted">{fmt.pct(s.pct, 1)}</span>
                </Link>
              </div>
              {isOpen && (
                <div className="mb-2 rounded-xl bg-black/5 dark:bg-white/5">
                  {s.children.map((k) => (
                    <Link key={k.categoryId} to={txLink(period, { c: k.categoryId, type: kind })} className="flex min-h-11 items-center gap-2 px-3">
                      <span className="flex-1 text-sm">{k.categoryId === s.categoryId ? t('categories.general') : categoryName(k.categoryId)}</span>
                      <span className="num text-sm text-muted">{fmt.pct(k.pct)}</span>
                      <span className="num w-28 text-end text-sm font-semibold">{fmt.money(k.amount)}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Timeline({ report, fmt }: { report: Report; fmt: Formatters }) {
  const { t } = useTranslation();
  const data = report.timeline.map((b) => ({
    label: b.unit === 'hour' ? fmt.date(b.start, 'time') : b.unit === 'day' ? String(new Date(b.start).getDate()) : fmt.date(b.start, 'monthYear').split(' ')[0],
    full: b.unit === 'month' ? fmt.date(b.start, 'monthYear') : fmt.date(b.start, b.unit === 'hour' ? 'dateTime' : 'medium'),
    income: b.income / 100,
    expense: b.expense / 100,
  }));
  return (
    <div className="h-56" dir="ltr">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }} barGap={1}>
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--color-muted)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" reversed={document.documentElement.dir === 'rtl'} />
          <Tooltip cursor={{ fill: 'rgba(127,127,127,0.12)' }}
            content={({ active, payload }) => active && payload?.length ? (
              <div className="rounded-xl bg-surface p-2 text-sm shadow-lg ring-1 ring-line" dir="auto">
                <p className="font-semibold">{(payload[0].payload as { full: string }).full}</p>
                <p className="num text-income">{t('types.income')}: {fmt.money(Math.round(Number(payload[0].payload.income) * 100))}</p>
                <p className="num text-expense">{t('types.expense')}: {fmt.money(Math.round(Number(payload[0].payload.expense) * 100))}</p>
              </div>
            ) : null} />
          <Bar dataKey="income" fill="var(--color-income)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
          <Bar dataKey="expense" fill="var(--color-expense)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function Reports() {
  const { t, i18n } = useTranslation();
  const fmt = useFmt();
  const nav = useNavigate();
  const names = useNames();
  const txs = useTransactions();
  const { period, previous, setPeriod } = usePeriod();
  const [exporting, setExporting] = useState<null | 'pdf' | 'image'>(null);
  const printRef = useRef<HTMLDivElement>(null);
  const fileShare = useFileShare();

  const report = useMemo(
    () => (txs && names.wallets && names.categories ? buildReport(names.wallets, names.categories, txs, period, previous) : null),
    [txs, names.wallets, names.categories, period, previous],
  );
  const periodText = periodLabel(period, fmt);
  const extras = useReportExtras(period, txs);
  const fileBase = `jeybi-${t('reports.fileName')}-${toDay(period.start)}`;

  // Renders the print view off-screen and captures it. The share/download buttons come after, in
  // the FileShare sheet, so share() runs inside the user's tap.
  const exportImage = (kind: 'pdf' | 'image') => {
    if (!report) return;
    fileShare(async () => {
      setExporting(kind);
      try {
        for (let i = 0; i < 100 && !printRef.current; i++) await new Promise((r) => setTimeout(r, 30));
        if (!printRef.current) throw new Error('print view did not mount');
        const { captureElement, canvasToPdf, canvasToPngBlob } = await import('../services/pdf');
        const canvas = await captureElement(printRef.current);
        const blob = kind === 'pdf' ? await canvasToPdf(canvas) : await canvasToPngBlob(canvas);
        return { blob, filename: `${fileBase}.${kind === 'pdf' ? 'pdf' : 'png'}`, title: `${t('reports.title')} — ${periodText}` };
      } finally {
        setExporting(null);
      }
    });
  };

  const exportExcel = () => {
    if (!report || !txs) return;
    fileShare(async () => {
    const { reportToExcel } = await import('../services/excel');
    const rows = filterTransactions(txs, { start: period.start, end: period.end }).map((r) => r.tx);
    const blob = await reportToExcel(report, rows, {
      rtl: i18n.dir() === 'rtl',
      sheetSummary: t('reports.sheetSummary'),
      sheetTransactions: t('reports.sheetTransactions'),
      title: `${t('app.name')} — ${t('reports.title')}`,
      periodLabel: periodText,
      currency: fmt.currencyLabel,
      rows: [
        [t('types.income'), report.totals.income / 100],
        [t('types.expense'), report.totals.expense / 100],
        [t('reports.net'), report.totals.net / 100],
        [t('reports.opening'), report.openingBalance / 100],
        [t('reports.closing'), report.closingBalance / 100],
        [t('reports.previousNet'), report.prevTotals.net / 100],
        [t('reports.currency'), fmt.currencyLabel],
      ],
      expenseHeader: [t('reports.expenseByCategory'), t('tx.amount'), '%'],
      incomeHeader: [t('reports.incomeBySource'), t('tx.amount'), '%'],
      walletHeader: [t('reports.byWallet'), t('types.income'), t('types.expense')],
      origHeader: t('currencies.original'),
      extraSheets: extrasSheets(extras, t, (id) => names.categoryName(id, true), (ms) => stripBidi(fmt.date(ms, 'medium'))),
      txHeader: [t('reports.col.date'), t('reports.col.type'), t('tx.amount'), t('tx.wallet'), t('tx.toWallet'), t('tx.category'), t('tx.note'), t('tx.tags')],
      categoryName: (id) => names.categoryName(id, true),
      walletName: names.walletName,
      typeName: (ty) => t(`types.${ty}`),
      formatDate: (ms) => stripBidi(fmt.date(ms, 'dateTime')),
    });
    return { blob, filename: `${fileBase}.xlsx`, title: `${t('reports.title')} — ${periodText}` };
    });
  };

  if (!report) return <PageHeader title={t('nav.reports')} />;
  const { totals, change } = report;

  return (
    <div>
      <PageHeader title={t('nav.reports')} />
      <div className="space-y-3 px-4">
        <PeriodNav period={period} setPeriod={setPeriod} />

        <div className="grid grid-cols-2 gap-2">
          <Link to={txLink(period, { type: 'income' })} className="card p-3">
            <p className="text-sm text-muted">{t('types.income')}</p>
            <p className="num text-xl font-bold text-income">{fmt.money(totals.income)}</p>
            <Change value={change.income} />
          </Link>
          <Link to={txLink(period, { type: 'expense' })} className="card p-3">
            <p className="text-sm text-muted">{t('types.expense')}</p>
            <p className="num text-xl font-bold text-expense">{fmt.money(totals.expense)}</p>
            <Change value={change.expense} invert />
          </Link>
          <div className="card col-span-2 flex items-center justify-between p-3">
            <div>
              <p className="text-sm text-muted">{t('reports.net')}</p>
              <p className={`num text-2xl font-extrabold ${totals.net >= 0 ? 'text-income' : 'text-expense'}`}>{fmt.money(totals.net, { sign: true })}</p>
              <p className="text-xs text-muted">{t('reports.vsPrevious')} <Change value={change.net} /></p>
            </div>
            <div className="text-end text-sm">
              <p className="text-muted">{t('reports.opening')}</p>
              <p className="num font-semibold">{fmt.money(report.openingBalance)}</p>
              <p className="mt-1 text-muted">{t('reports.closing')}</p>
              <p className="num font-semibold">{fmt.money(report.closingBalance)}</p>
            </div>
          </div>
        </div>

        <button className="card flex w-full items-center gap-3 p-4 text-start" onClick={() => nav(`/reports/where?${new URLSearchParams(periodToParams(period))}`)}>
          <HelpCircle className="size-6 text-teal-700 dark:text-teal-400" />
          <span className="flex-1 font-bold">{t('where.title')}</span>
          <ChevronDown className="size-5 -rotate-90 text-muted rtl:rotate-90" />
        </button>

        {report.txCount === 0 ? (
          <Empty title={t('reports.empty')} hint={t('reports.emptyHint')} />
        ) : (
          <>
            <section className="card p-4">
              <h2 className="mb-2 font-bold">{t('reports.expenseByCategory')}</h2>
              <Breakdown slices={report.expenseByCategory} kind="expense" period={period} fmt={fmt} />
            </section>
            <section className="card p-4">
              <h2 className="mb-2 font-bold">{t('reports.incomeBySource')}</h2>
              <Breakdown slices={report.incomeByCategory} kind="income" period={period} fmt={fmt} />
            </section>
            <section className="card p-4">
              <h2 className="mb-2 font-bold">{t('reports.timeline')}</h2>
              <Timeline report={report} fmt={fmt} />
            </section>
            <section className="card p-4">
              <h2 className="mb-2 font-bold">{t('reports.byWallet')}</h2>
              <div className="divide-y divide-line">
                {report.byWallet.map((w) => {
                  const wl = names.wallet(w.walletId);
                  return (
                    <Link key={w.walletId} to={txLink(period, { w: w.walletId })} className="flex min-h-14 items-center gap-3">
                      <IconBadge name={wl?.icon ?? 'wallet'} color={wl?.color ?? '#94a3b8'} size="sm" />
                      <span className="flex-1 font-semibold">{names.walletName(w.walletId)}</span>
                      <span className="text-end text-sm">
                        <span className="num block text-income">+{fmt.num(w.income)}</span>
                        <span className="num block text-expense">-{fmt.num(w.expense)}</span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            </section>
            <section className="card overflow-hidden">
              <h2 className="p-4 pb-1 font-bold">{t('reports.topExpenses')}</h2>
              <div className="divide-y divide-line">
                {report.topExpenses.map((tx) => <TxRow key={tx.id} tx={tx} fmt={fmt} showDate onClick={() => nav(`/tx/${tx.id}`)} />)}
              </div>
            </section>
          </>
        )}

        <ReportExtras data={extras} />

        <section className="card p-4">
          <h2 className="mb-3 font-bold">{t('reports.export')}</h2>
          <div className="grid grid-cols-3 gap-2">
            <button className="btn-soft flex-col gap-1 py-2 text-sm" onClick={exportExcel}><FileSpreadsheet className="size-5" />Excel</button>
            <button className="btn-soft flex-col gap-1 py-2 text-sm" disabled={!!exporting} onClick={() => exportImage('pdf')}><FileText className="size-5" />PDF</button>
            <button className="btn-soft flex-col gap-1 py-2 text-sm" disabled={!!exporting} onClick={() => exportImage('image')}><Share2 className="size-5" />{t('reports.shareImage')}</button>
          </div>
          {exporting && <p className="mt-2 text-center text-sm text-muted">{t('reports.preparing')}</p>}
        </section>
      </div>

      {exporting && (
        <div aria-hidden style={{ position: 'fixed', top: 0, left: -10000, zIndex: -1 }}>
          <ReportPrint ref={printRef} report={report} periodText={periodText} fmt={fmt} variant={exporting === 'pdf' ? 'full' : 'summary'} />
        </div>
      )}
    </div>
  );
}
