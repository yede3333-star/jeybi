import { addDays, startOfDay, subMonths } from 'date-fns';
import { db } from '../data/db';
import type { Category, Wallet } from '../data/types';
import { createTransaction, type TxInput } from './transactions';
import { rebuildFlows } from './flows';

/** Deterministic PRNG so the demo looks the same every time. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

export async function hasDemoData(): Promise<boolean> {
  return (await db.transactions.filter((t) => !!t.demo).count()) > 0;
}

/** Adds ~6 months of realistic sample transactions (all flagged `demo`, removable). */
export async function addDemoData(lang: 'ar' | 'fr' = 'ar', now = Date.now()): Promise<number> {
  const L = (ar: string, fr: string) => (lang === 'ar' ? ar : fr);
  const wallets = (await db.wallets.toArray()).filter((w) => !w.archived);
  const cats = (await db.categories.toArray()).filter((c) => !c.archived);
  if (wallets.length < 2) throw new Error('needWallets');

  const w = (key: string): Wallet => wallets.find((x) => x.sysKey === key) ?? wallets[0];
  const c = (key: string, kind: 'income' | 'expense'): Category | undefined =>
    cats.find((x) => x.sysKey === key) ?? cats.find((x) => x.kind === kind);
  const cash = w('cash'), bankily = w('bankily'), bank = w('bank');
  const r = rng(42);
  const between = (a: number, b: number, step = 50) => Math.round((a + r() * (b - a)) / step) * step * 100;
  const at = (day: Date, h: number, m = Math.floor(r() * 60)) => +day + h * 3600e3 + m * 60e3;

  const items: TxInput[] = [];
  const exp = (day: Date, h: number, key: string, amount: number, wallet: Wallet, note = '', tags: string[] = []) => {
    const cat = c(key, 'expense');
    if (cat) items.push({ type: 'expense', amount, walletId: wallet.id, categoryId: cat.id, date: at(day, h), note, tags, demo: true });
  };
  const inc = (day: Date, h: number, key: string, amount: number, wallet: Wallet, note = '') => {
    const cat = c(key, 'income');
    if (cat) items.push({ type: 'income', amount, walletId: wallet.id, categoryId: cat.id, date: at(day, h), note, demo: true });
  };
  const transfer = (day: Date, h: number, from: Wallet, to: Wallet, amount: number, fee = 0, note = '') => {
    if (from.id !== to.id) items.push({ type: 'transfer', amount, walletId: from.id, toWalletId: to.id, fee, date: at(day, h), note, demo: true });
  };

  const today = startOfDay(now);
  const first = startOfDay(subMonths(today, 6));
  for (let d = first; +d <= +today; d = addDays(d, 1)) {
    const dom = d.getDate(), dow = d.getDay();
    if (dom === 1) {
      inc(d, 9, 'salary', 45000_00, bank, L('راتب الشهر', 'Salaire du mois'));
      transfer(d, 12, bank, bankily, 34000_00, 0, L('تحويل للمحفظة', 'Virement vers le portefeuille'));
      exp(d, 13, 'rent', 9000_00, bank, L('إيجار الشقة', 'Loyer de l’appartement'));
      exp(d, 14, 'education', 2000_00, bankily, L('دروس خصوصية', 'Cours particuliers'));
    }
    if (dom === 5 || dom === 20) exp(d, 18, 'family', between(2000, 3000, 500), bankily, L('مصروف الأهل', 'Argent pour la famille'));
    if (dom === 10) exp(d, 11, 'utilities', between(1500, 2800), bankily, L('فاتورة الكهرباء والماء', 'Facture eau et électricité'));
    if (dom === 15 && r() < 0.7) inc(d, 16, 'commissions', between(3000, 9000, 500), bankily, L('عمولة', 'Commission'));
    if (r() < 0.05) inc(d, 17, 'services', between(1000, 4000, 500), cash, L('خدمة', 'Service rendu'));
    if (dow === 1) transfer(d, 10, bankily, cash, 4000_00, 40_00, L('سحب نقدي', 'Retrait'));
    if (dom % 3 === 0) exp(d, 8, 'phone', 200_00, bankily, '', []);
    if (r() < 0.6) exp(d, 19, c('groceries', 'expense') ? 'groceries' : 'food', between(150, 500), cash);
    if (r() < 0.07) exp(d, 21, c('restaurants', 'expense') ? 'restaurants' : 'food', between(400, 1200), cash, L('عشاء', 'Dîner'));
    const taxis = r() < 0.6 ? (r() < 0.4 ? 2 : 1) : 0;
    for (let i = 0; i < taxis; i++) exp(d, 7 + i * 10, c('taxi', 'expense') ? 'taxi' : 'transport', between(100, 200), cash);
    if (dow === 5) exp(d, 13, 'charity', between(100, 500), cash, L('صدقة الجمعة', 'Aumône du vendredi'));
    if (r() < 0.03) exp(d, 10, 'health', between(300, 1500), cash, L('صيدلية', 'Pharmacie'));
    if (r() < 0.02) exp(d, 17, 'clothes', between(1500, 5000, 500), bankily);
    // Monthly market trip, split between groceries and household items
    if (dom === 12) {
      const g = c('groceries', 'expense') ?? c('food', 'expense'), o = c('other_expense', 'expense');
      if (g && o) items.push({ type: 'expense', amount: 5000_00, walletId: bankily.id, date: at(d, 17), note: L('سوق كبتال', 'Marché Capitale'),
        splits: [{ categoryId: g.id, amount: 3000_00 }, { categoryId: o.id, amount: 2000_00 }], demo: true });
    }
  }
  // A trip to Rosso and a wedding, to show tags
  const trip = startOfDay(subMonths(today, 2));
  exp(trip, 7, c('taxi', 'expense') ? 'taxi' : 'transport', 3000_00, cash, L('سيارة إلى روصو', 'Voiture pour Rosso'), [L('سفر_روصو', 'voyage_Rosso')]);
  exp(trip, 13, 'food', 1500_00, cash, L('غداء في الطريق', 'Déjeuner en route'), [L('سفر_روصو', 'voyage_Rosso')]);
  exp(addDays(trip, 1), 10, 'other_expense', 4000_00, cash, L('مبيت', 'Hébergement'), [L('سفر_روصو', 'voyage_Rosso')]);
  exp(addDays(trip, 1), 18, c('taxi', 'expense') ? 'taxi' : 'transport', 3000_00, cash, L('عودة إلى نواكشوط', 'Retour à Nouakchott'), [L('سفر_روصو', 'voyage_Rosso')]);
  const wedding = startOfDay(subMonths(today, 1));
  exp(wedding, 16, 'family', 5000_00, bankily, L('هدية العرس', 'Cadeau de mariage'), [L('عرس', 'mariage')]);
  exp(addDays(wedding, -2), 17, 'clothes', 4000_00, cash, L('دراعة جديدة', 'Nouveau boubou'), [L('عرس', 'mariage')]);

  const past = items.filter((i) => i.date <= now);
  await db.transaction('rw', [db.transactions, db.audit, db.meta, db.categories, db.receipts, db.debts], async () => {
    for (const it of past) await createTransaction(it);
  });
  // Count stored rows, not inputs: transfers with a fee also create a linked fee expense.
  return db.transactions.filter((t) => !!t.demo).count();
}

export async function clearDemoData(): Promise<number> {
  return db.transaction('rw', db.transactions, db.audit, db.meta, async () => {
    const ids = await db.transactions.filter((t) => !!t.demo).primaryKeys();
    await db.transactions.bulkDelete(ids);
    for (const id of ids) await db.audit.where('txId').equals(id).delete();
    await rebuildFlows();
    return ids.length;
  });
}
