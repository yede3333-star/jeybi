import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArchiveRestore, Trash2 } from 'lucide-react';
import { PageHeader, Empty } from '../components/ui';
import { TxRow } from '../components/TxRow';
import { useToast } from '../components/Toast';
import { useFmt } from '../hooks/fmt';
import { emptyTrash, listDeleted, purgeTransaction, restoreTransaction } from '../repo/transactions';

export default function Trash() {
  const { t } = useTranslation();
  const fmt = useFmt();
  const toast = useToast();
  const items = useLiveQuery(listDeleted, []);

  return (
    <div>
      <PageHeader back title={t('settings.trash')} actions={items && items.length > 0 ? (
        <button className="btn-danger min-h-10 text-sm" onClick={async () => {
          if (confirm(t('trash.emptyConfirm', { n: items.length }))) await emptyTrash();
        }}>{t('trash.empty')}</button>
      ) : undefined} />
      <p className="px-5 pb-2 text-sm text-muted">{t('trash.hint')}</p>
      {items?.length === 0 && <Empty icon={<Trash2 className="size-10" />} title={t('trash.nothing')} />}
      <div className="space-y-2 px-4">
        {items?.map((tx) => (
          <div key={tx.id} className="card overflow-hidden">
            <TxRow tx={tx} fmt={fmt} showDate />
            <div className="flex items-center gap-2 border-t border-line px-3 py-2">
              <span className="flex-1 text-xs text-muted">{t('trash.deletedAt', { date: fmt.date(tx.deletedAt!, 'dateTime') })}</span>
              <button className="btn-soft min-h-10 text-sm" onClick={async () => { await restoreTransaction(tx.id); toast({ message: t('trash.restored') }); }}>
                <ArchiveRestore className="size-4" />{t('trash.restore')}
              </button>
              <button className="btn-danger min-h-10 text-sm" onClick={async () => { if (confirm(t('trash.purgeConfirm'))) await purgeTransaction(tx.id); }}>
                <Trash2 className="size-4" />{t('trash.purge')}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
