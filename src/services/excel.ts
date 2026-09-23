import type { Transaction } from '../data/types';
import type { Report } from './reports';
import { fromMinor } from '../lib/money';

export interface ExcelLabels {
  rtl: boolean;
  sheetSummary: string;
  sheetTransactions: string;
  title: string;
  periodLabel: string;
  currency: string;
  rows: Array<[string, string | number]>;
  expenseHeader: [string, string, string];
  incomeHeader: [string, string, string];
  walletHeader: [string, string, string];
  txHeader: string[];
  categoryName: (id: string) => string;
  walletName: (id: string) => string;
  typeName: (t: Transaction['type']) => string;
  formatDate: (ms: number) => string;
}

/** Builds an .xlsx with a summary sheet and a detailed transactions sheet. */
export async function reportToExcel(report: Report, txs: Transaction[], L: ExcelLabels): Promise<Blob> {
  const XLSX = await import('xlsx');
  const summary: Array<Array<string | number>> = [[L.title], [L.periodLabel], []];
  for (const [k, v] of L.rows) summary.push([k, v]);
  summary.push([], L.expenseHeader);
  for (const s of report.expenseByCategory) {
    summary.push([L.categoryName(s.categoryId), fromMinor(s.amount), Math.round(s.pct * 10) / 10]);
    if (s.children.length > 1 || (s.children[0] && s.children[0].categoryId !== s.categoryId))
      for (const c of s.children) summary.push([`   · ${L.categoryName(c.categoryId)}`, fromMinor(c.amount), Math.round(c.pct * 10) / 10]);
  }
  summary.push([], L.incomeHeader);
  for (const s of report.incomeByCategory) summary.push([L.categoryName(s.categoryId), fromMinor(s.amount), Math.round(s.pct * 10) / 10]);
  summary.push([], L.walletHeader);
  for (const w of report.byWallet) summary.push([L.walletName(w.walletId), fromMinor(w.income), fromMinor(w.expense)]);

  const rows: Array<Array<string | number>> = [L.txHeader];
  for (const t of [...txs].sort((a, b) => a.date - b.date)) {
    const cats = t.splits.length > 1
      ? t.splits.map((s) => `${L.categoryName(s.categoryId)} (${fromMinor(s.amount)})`).join(' + ')
      : t.splits[0] ? L.categoryName(t.splits[0].categoryId) : '';
    rows.push([
      L.formatDate(t.date), L.typeName(t.type),
      fromMinor(t.type === 'expense' ? -t.amount : t.amount),
      L.walletName(t.walletId), t.toWalletId ? L.walletName(t.toWalletId) : '',
      cats, t.note, t.tags.map((x) => `#${x}`).join(' '),
    ]);
  }

  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.aoa_to_sheet(summary);
  ws1['!cols'] = [{ wch: 34 }, { wch: 16 }, { wch: 14 }];
  const ws2 = XLSX.utils.aoa_to_sheet(rows);
  ws2['!cols'] = [{ wch: 18 }, { wch: 10 }, { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 30 }, { wch: 30 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, ws1, L.sheetSummary.slice(0, 31));
  XLSX.utils.book_append_sheet(wb, ws2, L.sheetTransactions.slice(0, 31));
  if (L.rtl) wb.Workbook = { Views: [{ RTL: true }] };
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
