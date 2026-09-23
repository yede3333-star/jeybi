import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../components/ui';
import { PeriodNav, usePeriod } from '../components/PeriodNav';
import { WhereSummary } from '../components/WhereSummary';
import { useNames, useTransactions } from '../hooks/data';
import { useFmt } from '../hooks/fmt';
import { buildReport } from '../services/reports';
import { periodLabel } from '../lib/periodParams';

/** "Where did my money go?" — one simple page in plain words. */
export default function WhereMoney() {
  const { t } = useTranslation();
  const fmt = useFmt();
  const { wallets, categories } = useNames();
  const txs = useTransactions();
  const { period, previous, setPeriod } = usePeriod();
  const report = useMemo(
    () => (txs && wallets && categories ? buildReport(wallets, categories, txs, period, previous) : null),
    [txs, wallets, categories, period, previous],
  );
  return (
    <div>
      <PageHeader back title={t('where.title')} />
      <div className="space-y-4 px-4">
        <PeriodNav period={period} setPeriod={setPeriod} />
        {report && (
          <div className="card p-5">
            <WhereSummary report={report} periodText={periodLabel(period, fmt)} fmt={fmt} large />
          </div>
        )}
      </div>
    </div>
  );
}
