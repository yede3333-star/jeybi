import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Undo2 } from 'lucide-react';

interface ToastOpts {
  message: string;
  undo?: () => Promise<void> | void;
  duration?: number;
  tone?: 'default' | 'error';
}

const Ctx = createContext<(o: ToastOpts) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [toast, setToast] = useState<(ToastOpts & { id: number }) | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const show = useCallback((o: ToastOpts) => {
    window.clearTimeout(timer.current);
    const id = Date.now();
    setToast({ ...o, id });
    timer.current = window.setTimeout(() => setToast((cur) => (cur?.id === id ? null : cur)), o.duration ?? (o.undo ? 6000 : 3000));
  }, []);
  return (
    <Ctx.Provider value={show}>
      {children}
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center px-4" role="status" aria-live="polite">
          <div
            key={toast.id}
            className={`animate-toast pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl px-4 py-3 text-white shadow-xl ${
              toast.tone === 'error' ? 'bg-red-700' : 'bg-neutral-900 dark:bg-neutral-800'
            }`}
          >
            <span className="min-w-0 flex-1">{toast.message}</span>
            {toast.undo && (
              <button
                className="flex min-h-10 items-center gap-1 rounded-lg px-3 font-bold text-amber-300 active:bg-white/10"
                onClick={async () => {
                  const u = toast.undo!;
                  setToast(null);
                  await u();
                }}
              >
                <Undo2 className="size-4" />
                {t('common.undo')}
              </button>
            )}
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
