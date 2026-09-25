// Settings → words learned by "اكتب يومك" from the user's corrections ("شاي ← طعام"). Stored in
// settings.smartRules, so they travel with backups.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BookA, Pencil, Trash2 } from 'lucide-react';
import { Empty, PageHeader, Sheet } from '../components/ui';
import { CategorySelect } from '../components/pickers';
import { useNames } from '../hooks/data';
import { useSettings } from '../hooks/settings';
import { setRule } from '../repo/smart';
import type { SmartRule } from '../services/smartParse';

export default function SmartWords() {
  const { t } = useTranslation();
  const s = useSettings();
  const { categoryName, walletName, category, wallet } = useNames();
  const [edit, setEdit] = useState<{ word: string; rule: SmartRule } | null>(null);
  const rows = Object.entries(s.smartRules).sort(([a], [b]) => a.localeCompare(b, 'ar'));

  return (
    <div>
      <PageHeader back title={t('smart.wordsTitle')} />
      <div className="space-y-3 px-4">
        <p className="px-1 text-sm text-muted">{t('smart.wordsHint')}</p>
        {!rows.length ? (
          <Empty icon={<BookA className="size-10" />} title={t('smart.wordsEmpty')} />
        ) : (
          <div className="card divide-y divide-line">
            {rows.map(([word, rule]) => (
              <div key={word} className="flex min-h-14 items-center gap-2 px-4 py-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold"><bdi>{word}</bdi></p>
                  <p className="text-sm text-muted">
                    {[rule.categoryId && category(rule.categoryId) ? categoryName(rule.categoryId, true) : null,
                      rule.walletId && wallet(rule.walletId) ? walletName(rule.walletId) : null].filter(Boolean).join(' · ') || t('common.unknown')}
                  </p>
                </div>
                <button className="btn-ghost size-10 min-h-10 rounded-full p-0" onClick={() => setEdit({ word, rule })} aria-label={t('common.edit')}><Pencil className="size-4" /></button>
                <button className="btn-ghost size-10 min-h-10 rounded-full p-0 text-expense" onClick={() => void setRule(word, null)} aria-label={t('common.delete')}><Trash2 className="size-4" /></button>
              </div>
            ))}
          </div>
        )}
      </div>
      {edit && <EditRule word={edit.word} rule={edit.rule} onClose={() => setEdit(null)} />}
    </div>
  );
}

function EditRule({ word, rule, onClose }: { word: string; rule: SmartRule; onClose: () => void }) {
  const { t } = useTranslation();
  const { wallets, nameOf } = useNames();
  const [categoryId, setCategoryId] = useState(rule.categoryId ?? '');
  const [walletId, setWalletId] = useState(rule.walletId ?? '');
  return (
    <Sheet open onClose={onClose} title={word}
      footer={<button className="btn-primary w-full" onClick={async () => { await setRule(word, { categoryId: categoryId || undefined, walletId: walletId || undefined }); onClose(); }}>{t('common.save')}</button>}>
      <div className="space-y-4">
        <div>
          <span className="label">{t('tx.category')}</span>
          <CategorySelect value={categoryId} onChange={setCategoryId} placeholder={t('smart.noChange')} />
          {categoryId && <button className="mt-1 text-sm text-muted underline" onClick={() => setCategoryId('')}>{t('smart.noChange')}</button>}
        </div>
        <div>
          <label className="label" htmlFor="rw">{t('tx.wallet')}</label>
          <select id="rw" className="input" value={walletId} onChange={(e) => setWalletId(e.target.value)}>
            <option value="">{t('smart.noChange')}</option>
            {(wallets ?? []).filter((w) => !w.archived).map((w) => <option key={w.id} value={w.id}>{nameOf(w)}</option>)}
          </select>
        </div>
      </div>
    </Sheet>
  );
}
