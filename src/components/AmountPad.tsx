import { useEffect } from 'react';
import { Delete } from 'lucide-react';
import { keypadAppend } from '../lib/money';
import type { Lang } from '../lib/money';

/** Formats the raw keypad buffer ("12500.5") with grouping, keeping a trailing separator while typing. */
export function formatBuffer(buf: string, lang: Lang): string {
  if (!buf) return '0';
  const [i, f] = buf.split('.');
  const int = new Intl.NumberFormat(lang === 'ar' ? 'ar-u-nu-latn' : 'fr-FR-u-nu-latn', { numberingSystem: 'latn' } as Intl.NumberFormatOptions)
    .format(Number(i || '0'))
    .replace(/\s/g, ' ');
  return f === undefined ? int : `${int}${lang === 'ar' ? '.' : ','}${f}`;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back'];

/** Large on-screen number pad. Also listens to the physical keyboard while `active`. */
export function AmountPad({ value, onChange, active = true, onEnter }: {
  value: string; onChange: (v: string) => void; active?: boolean; onEnter?: () => void;
}) {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) return;
      if (/^[0-9]$/.test(e.key)) onChange(keypadAppend(value, e.key));
      else if (e.key === '.' || e.key === ',') onChange(keypadAppend(value, '.'));
      else if (e.key === 'Backspace') onChange(keypadAppend(value, 'back'));
      else if (e.key === 'Enter') onEnter?.();
      else return;
      e.preventDefault();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [active, value, onChange, onEnter]);

  return (
    <div dir="ltr" className="grid grid-cols-3 gap-2">
      {KEYS.map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => onChange(keypadAppend(value, k))}
          onContextMenu={(e) => {
            if (k === 'back') { e.preventDefault(); onChange(''); }
          }}
          className="flex h-14 items-center justify-center rounded-2xl bg-surface text-2xl font-semibold ring-1 ring-line active:bg-teal-600/15"
          aria-label={k === 'back' ? 'backspace' : k}
        >
          {k === 'back' ? <Delete className="size-6" /> : k}
        </button>
      ))}
    </div>
  );
}
