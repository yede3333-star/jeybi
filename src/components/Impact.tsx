// "Warn, don't block": before an operation is saved, if it takes a wallet below zero or uses money
// set aside for a savings goal, the user sees the balances and chooses Continue or Edit.
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { PiggyBank, TriangleAlert } from 'lucide-react';
import { Sheet } from './ui';
import { useNames } from '../hooks/data';
import { useFmt } from '../hooks/fmt';
import { impactOf, releaseSavings } from '../repo/impact';
import { listGoals } from '../repo/goals';
import { hasImpact, type Deltas, type Impact } from '../services/impact';

/**
 * Resolves to null when the user chose "Edit" (don't save), otherwise to `{ after }`: call it once
 * the operation is saved (it takes the used savings back from their goals).
 */
export type ImpactGuard = (deltas: Deltas | Promise<Deltas>) => Promise<{ after: () => Promise<void> } | null>;

const NOOP = { after: async () => {} };
const Ctx = createContext<ImpactGuard>(async () => NOOP);
export const useImpactGuard = () => useContext(Ctx);

export function ImpactProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [pending, setPending] = useState<Impact | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const guard = useCallback<ImpactGuard>(async (d) => {
    const impact = await impactOf(await d);
    if (!hasImpact(impact)) return NOOP;
    const ok = await new Promise<boolean>((resolve) => { resolver.current = resolve; setPending(impact); });
    setPending(null);
    if (!ok) return null;
    return { after: () => (impact.savings.length ? releaseSavings(impact.savings, t('impact.releaseNote')) : Promise.resolve()) };
  }, [t]);

  const answer = (ok: boolean) => { resolver.current?.(ok); resolver.current = null; };

  return (
    <Ctx.Provider value={guard}>
      {children}
      {pending && <ImpactSheet impact={pending} onAnswer={answer} />}
    </Ctx.Provider>
  );
}

function ImpactSheet({ impact, onAnswer }: { impact: Impact; onAnswer: (ok: boolean) => void }) {
  const { t } = useTranslation();
  const fmt = useFmt();
  const { walletName } = useNames();
  const goals = useLiveQuery(listGoals, []);
  const goalName = (id: string) => goals?.find((g) => g.goal.id === id)?.goal.name ?? '…';
  return (
    <Sheet open onClose={() => onAnswer(false)} title={t('impact.title')}
      footer={
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-soft" onClick={() => onAnswer(false)}>{t('impact.edit')}</button>
          <button className="btn-primary" onClick={() => onAnswer(true)}>{t('impact.continue')}</button>
        </div>
      }>
      <div className="space-y-3">
        {impact.negative.map((n) => (
          <p key={n.walletId} className="flex gap-2 rounded-xl bg-red-600/10 p-3 text-sm text-red-800 dark:text-red-300">
            <TriangleAlert className="size-5 shrink-0" />
            <span>{t('impact.negative', { wallet: walletName(n.walletId), before: fmt.money(n.before), after: fmt.money(n.after) })}</span>
          </p>
        ))}
        {impact.negative.length > 0 && <p className="px-1 font-semibold">{t('impact.forgotIncome')}</p>}
        {impact.savings.map((s) => (
          <p key={`${s.goalId}:${s.walletId}`} className="flex gap-2 rounded-xl bg-amber-100 p-3 text-sm text-amber-900 dark:bg-amber-400/15 dark:text-amber-200">
            <PiggyBank className="size-5 shrink-0" />
            <span>{t('impact.savings', { amount: fmt.money(s.take), goal: goalName(s.goalId), wallet: walletName(s.walletId) })}</span>
          </p>
        ))}
        {impact.savings.length > 0 && <p className="px-1 text-sm text-muted">{t('impact.savingsHint')}</p>}
      </div>
    </Sheet>
  );
}
