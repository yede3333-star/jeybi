import { forwardRef, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import type { Report, CategorySlice } from '../services/reports';
import { useNames } from '../hooks/data';
import type { Formatters } from '../hooks/fmt';
import { WhereSummary } from './WhereSummary';

// The print view always uses the light palette, whatever the app theme.
const LIGHT: CSSProperties = {
  ['--color-surface' as string]: '#ffffff',
  ['--color-page' as string]: '#ffffff',
  ['--color-ink' as string]: '#10201c',
  ['--color-muted' as string]: '#5b6b66',
  ['--color-line' as string]: '#e3e8e5',
  ['--color-income' as string]: '#059669',
  ['--color-expense' as string]: '#dc2626',
  ['--color-transfer' as string]: '#2563eb',
  colorScheme: 'light',
  background: '#fff',
  color: '#10201c',
  width: 794,
  padding: 36,
  fontSize: 15,
  lineHeight: 1.5,
};

/**
 * Report laid out for A4 / image export. The browser shapes the Arabic text (joined letters, RTL);
 * services/pdf.ts then rasterises this node — no PDF font embedding needed.
 */
export const ReportPrint = forwardRef<HTMLDivElement, { report: Report; periodText: string; fmt: Formatters; variant: 'full' | 'summary' }>(
  function ReportPrint({ report, periodText, fmt, variant }, ref) {
    const { t, i18n } = useTranslation();
    const { categoryName, walletName, category } = useNames();
    const pct = (v: number | null) => (v == null ? '—' : fmt.pct(v, 0));

    const catTable = (rows: CategorySlice[], title: string) => rows.length > 0 && (
      <section style={{ marginTop: 24 }}>
        <h2 className="mb-2 text-lg font-bold">{title}</h2>
        <table className="w-full border-collapse text-start">
          <tbody>
            {rows.map((s) => (
              <tr key={s.categoryId} className="border-b border-line">
                <td className="py-1.5">
                  <span className="me-2 inline-block size-3 rounded-full align-middle" style={{ backgroundColor: category(s.categoryId)?.color }} />
                  {categoryName(s.categoryId)}
                  {s.children.length > 1 && (
                    <div className="ps-5 text-sm text-muted">
                      {s.children.map((c) => `${categoryName(c.categoryId)}: ${fmt.num(c.amount)}`).join(' · ')}
                    </div>
                  )}
                </td>
                <td className="w-40 py-1.5">
                  <div className="h-2 rounded-full bg-black/5"><div className="h-2 rounded-full" style={{ width: `${s.pct}%`, backgroundColor: category(s.categoryId)?.color }} /></div>
                </td>
                <td className="num w-16 py-1.5 text-center text-muted">{fmt.pct(s.pct)}</td>
                <td className="num w-36 py-1.5 text-end font-semibold">{fmt.money(s.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    );

    return (
      <div ref={ref} dir={i18n.dir()} lang={i18n.language} style={LIGHT} className="font-sans">
        <header className="flex items-center justify-between border-b-2 border-teal-700 pb-3">
          <div>
            <h1 className="text-2xl font-extrabold text-teal-800">{t('reports.title')}</h1>
            <p className="text-lg">{periodText}</p>
          </div>
          <div className="text-end">
            <p className="text-xl font-extrabold text-teal-800">{t('app.name')}</p>
            <p className="num text-sm text-muted">{fmt.date(Date.now(), 'dateTime')}</p>
          </div>
        </header>

        <section className="mt-5 grid grid-cols-3 gap-3">
          {[
            { label: t('types.income'), v: report.totals.income, c: report.change.income, cls: 'text-income' },
            { label: t('types.expense'), v: report.totals.expense, c: report.change.expense, cls: 'text-expense' },
            { label: t('reports.net'), v: report.totals.net, c: report.change.net, cls: report.totals.net >= 0 ? 'text-income' : 'text-expense' },
          ].map((x) => (
            <div key={x.label} className="rounded-xl border border-line p-3">
              <p className="text-sm text-muted">{x.label}</p>
              <p className={`num text-xl font-bold ${x.cls}`}>{fmt.money(x.v)}</p>
              <p className="text-xs text-muted">{t('reports.vsPrevious')}: <span className="num">{pct(x.c)}</span></p>
            </div>
          ))}
        </section>
        <p className="mt-3 text-sm">
          {t('reports.opening')}: <b className="num">{fmt.money(report.openingBalance)}</b>
          {'   ·   '}
          {t('reports.closing')}: <b className="num">{fmt.money(report.closingBalance)}</b>
        </p>

        <section className="mt-6 rounded-xl border border-line p-4">
          <h2 className="mb-2 text-lg font-bold">{t('where.title')}</h2>
          <WhereSummary report={report} periodText={periodText} fmt={fmt} />
        </section>

        {catTable(report.expenseByCategory, t('reports.expenseByCategory'))}
        {variant === 'full' && catTable(report.incomeByCategory, t('reports.incomeBySource'))}

        {variant === 'full' && report.byWallet.length > 0 && (
          <section style={{ marginTop: 24 }}>
            <h2 className="mb-2 text-lg font-bold">{t('reports.byWallet')}</h2>
            <table className="w-full border-collapse">
              <thead><tr className="border-b-2 border-line text-sm text-muted">
                <th className="py-1 text-start font-medium">{t('tx.wallet')}</th>
                <th className="py-1 text-end font-medium">{t('types.income')}</th>
                <th className="py-1 text-end font-medium">{t('types.expense')}</th>
              </tr></thead>
              <tbody>
                {report.byWallet.map((w) => (
                  <tr key={w.walletId} className="border-b border-line">
                    <td className="py-1.5">{walletName(w.walletId)}</td>
                    <td className="num py-1.5 text-end text-income">{fmt.money(w.income)}</td>
                    <td className="num py-1.5 text-end text-expense">{fmt.money(w.expense)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {variant === 'full' && report.topExpenses.length > 0 && (
          <section style={{ marginTop: 24 }}>
            <h2 className="mb-2 text-lg font-bold">{t('reports.topExpenses')}</h2>
            <table className="w-full border-collapse">
              <tbody>
                {report.topExpenses.map((tx, i) => (
                  <tr key={tx.id} className="border-b border-line">
                    <td className="num w-8 py-1.5 text-muted">{i + 1}</td>
                    <td className="py-1.5">
                      {tx.splits.map((s) => categoryName(s.categoryId)).join(' + ')}
                      {tx.note && <span className="text-sm text-muted"> — {tx.note}</span>}
                    </td>
                    <td className="num w-28 py-1.5 text-sm text-muted">{fmt.date(tx.date, 'medium')}</td>
                    <td className="num w-36 py-1.5 text-end font-semibold">{fmt.money(tx.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
        <p className="mt-8 text-center text-xs text-muted">{t('reports.footer')}</p>
      </div>
    );
  },
);
