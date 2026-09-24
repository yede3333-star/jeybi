import { db } from '../data/db';
import type { ID } from '../data/types';
import { computeZakat, hawlStatus } from '../services/zakat';
import { debtSummary } from './debts';
import { getBalances } from './summary';
import { getSettings, setSettings, type ZakatSettings } from './settings';
import { createTransaction } from './transactions';

export async function zakatSnapshot(now = Date.now()) {
  const [s, balances, wallets, debts] = await Promise.all([getSettings(), getBalances(), db.wallets.toArray(), debtSummary()]);
  const z = s.zakat;
  const counted = wallets.filter((w) => !w.archived && (z.walletIds == null || z.walletIds.includes(w.id)));
  const result = computeZakat({
    walletBalances: counted.map((w) => balances.byWallet.get(w.id) ?? 0),
    receivables: debts.owedToMe,
    payables: debts.iOwe,
    includeReceivables: z.includeReceivables,
    subtractPayables: z.subtractPayables,
    basis: z.basis,
    gramPrice: z.basis === 'gold' ? z.gramPriceGold : z.gramPriceSilver,
  });
  return { settings: z, wallets, counted, result, hawl: hawlStatus(z.hawlStart, now) };
}

export async function updateZakatSettings(patch: Partial<ZakatSettings>) {
  const { zakat } = await getSettings();
  await setSettings({ zakat: { ...zakat, ...patch } });
}

/**
 * Records the zakat paid as an expense in the "zakat" category. When a hawl was complete, the next
 * hawl starts where this one ended.
 */
export async function recordZakatPayment(walletId: ID, amount: number, note: string, now = Date.now()) {
  const cat = (await db.categories.toArray()).find((c) => c.sysKey === 'zakat');
  if (!cat) throw new Error('missing zakat category');
  const res = await createTransaction({ type: 'expense', amount, walletId, categoryId: cat.id, date: now, note });
  const { zakat } = await getSettings();
  const hawl = hawlStatus(zakat.hawlStart, now);
  await updateZakatSettings({ lastPaidAt: now, ...(hawl?.complete ? { hawlStart: hawl.end } : {}) });
  return res;
}
