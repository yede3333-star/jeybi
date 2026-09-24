import { createContext, lazy, Suspense, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Transaction } from '../data/types';
import type { EditType } from './TxSheet';

// The editor (keypad, category grid, calendar, tags…) is its own chunk so it stays out of the
// startup bundle. It is prefetched when the app goes idle, so the first tap on + is still instant.
const loadSheet = () => import('./TxSheet');
const TxSheet = lazy(loadSheet);

interface EditorApi {
  openNew: (type?: EditType) => void;
  openEdit: (tx: Transaction) => void;
}

const Ctx = createContext<EditorApi>({ openNew: () => {}, openEdit: () => {} });
export const useTxEditor = () => useContext(Ctx);

export function TxEditorProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ key: number; type: EditType; tx?: Transaction } | null>(null);
  const api = useMemo<EditorApi>(() => ({
    openNew: (type = 'expense') => setState({ key: Date.now(), type }),
    openEdit: (tx) => { if (tx.type !== 'debt') setState({ key: Date.now(), type: tx.type, tx }); },
  }), []);
  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1500));
    idle(() => void loadSheet());
  }, []);
  return (
    <Ctx.Provider value={api}>
      {children}
      {state && (
        <Suspense fallback={null}>
          <TxSheet key={state.key} initialType={state.type} tx={state.tx} onClose={() => setState(null)} />
        </Suspense>
      )}
    </Ctx.Provider>
  );
}
