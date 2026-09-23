import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Hash, X } from 'lucide-react';
import { useTags } from '../hooks/data';
import { normalizeTag } from '../repo/transactions';

/** Multi-tag input (#wedding #trip) with suggestions from previously used tags. */
export function TagInput({ value, onChange }: { value: string[]; onChange: (tags: string[]) => void }) {
  const { t } = useTranslation();
  const known = useTags();
  const [text, setText] = useState('');
  const q = normalizeTag(text).toLowerCase();
  const suggestions = known.filter((k) => !value.includes(k) && (!q || k.toLowerCase().includes(q))).slice(0, 8);

  const add = (raw: string) => {
    const tag = normalizeTag(raw);
    if (tag && !value.includes(tag)) onChange([...value, tag]);
    setText('');
  };

  return (
    <div>
      <div className="input flex min-h-12 flex-wrap items-center gap-1.5 py-1.5">
        {value.map((tag) => (
          <span key={tag} className="chip chip-on min-h-8">
            #{tag}
            <button type="button" onClick={() => onChange(value.filter((x) => x !== tag))} aria-label={t('common.remove')}>
              <X className="size-3.5" />
            </button>
          </span>
        ))}
        <input
          className="min-w-24 flex-1 bg-transparent outline-none"
          value={text}
          placeholder={value.length ? '' : t('tx.tagsPlaceholder')}
          onChange={(e) => {
            const v = e.target.value;
            if (/[\s,،]$/.test(v) && v.trim()) add(v);
            else setText(v);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); if (text.trim()) add(text); }
            else if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1));
          }}
          onBlur={() => text.trim() && add(text)}
        />
      </div>
      {suggestions.length > 0 && (
        <div className="no-scrollbar mt-2 flex gap-1.5 overflow-x-auto">
          {suggestions.map((s) => (
            <button key={s} type="button" className="chip shrink-0" onMouseDown={(e) => e.preventDefault()} onClick={() => add(s)}>
              <Hash className="size-3.5 text-muted" />
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
