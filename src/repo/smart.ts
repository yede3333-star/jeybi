// "اكتب يومك": saving the reviewed entries (all or nothing, one undo) and the words learned from
// the user's corrections.
import { db } from '../data/db';
import { createTransaction, type TxInput, type Undo } from './transactions';
import { createDebt, type DebtInput } from './debts';
import { getSettings, setSettings } from './settings';
import type { SmartRule } from '../services/smartParse';
import type { ID } from '../data/types';

export type SmartDraft =
  | { kind: 'tx'; input: TxInput }
  | { kind: 'debt'; input: DebtInput };

/**
 * Saves every entry in one database transaction: if one fails (e.g. an amount too large), nothing
 * is saved. `sourceText` (the whole sentence) is kept on each transaction so search finds it.
 */
export async function saveSmartEntries(drafts: SmartDraft[], sourceText: string): Promise<{ count: number; undo: Undo }> {
  const undos: Undo[] = [];
  await db.transaction('rw', db.tables, async () => {
    for (const d of drafts) {
      if (d.kind === 'tx') undos.push((await createTransaction({ ...d.input, sourceText })).undo);
      else undos.push((await createDebt(d.input)).undo);
    }
  });
  return {
    count: drafts.length,
    undo: async () => {
      for (const u of [...undos].reverse()) await u();
    },
  };
}

/** Remembers a correction: next time this word gives this category and/or wallet. */
export async function learnRule(word: string, patch: { categoryId?: ID; walletId?: ID }): Promise<void> {
  if (!word) return;
  const { smartRules } = await getSettings();
  const cur = smartRules[word] ?? {};
  await setSettings({ smartRules: { ...smartRules, [word]: { ...cur, ...patch, updatedAt: Date.now() } } });
}

export async function setRule(word: string, rule: SmartRule | null): Promise<void> {
  const { smartRules } = await getSettings();
  const next = { ...smartRules };
  if (rule && (rule.categoryId || rule.walletId)) next[word] = { ...rule, updatedAt: Date.now() };
  else delete next[word];
  await setSettings({ smartRules: next });
}
