import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Segmented } from './ui';
import { useSettings } from '../hooks/settings';
import { useFmt } from '../hooks/fmt';
import { customPeriod, periodFor, previousPeriod, shiftPeriod, type Period, type PeriodKind } from '../lib/period';
import { fromDay, periodFromParams, periodLabel, periodToParams, toDay } from '../lib/periodParams';

/** Period held in the URL (?k=month&a=2026-09-01) so reports are linkable and survive navigation. */
export function usePeriod() {
  const [params, setParams] = useSearchParams();
  const { weekStartsOn } = useSettings();
  const period = useMemo(() => periodFromParams(params, weekStartsOn), [params, weekStartsOn]);
  const previous = useMemo(() => previousPeriod(period, weekStartsOn), [period, weekStartsOn]);
  const setPeriod = (p: Period) => setParams(periodToParams(p), { replace: true });
  return { period, previous, setPeriod, weekStartsOn };
}

export function PeriodNav({ period, setPeriod }: { period: Period; setPeriod: (p: Period) => void }) {
  const { t } = useTranslation();
  const fmt = useFmt();
  const { weekStartsOn } = useSettings();
  const isFuture = period.end > Date.now() && period.kind !== 'custom';

  const changeKind = (k: PeriodKind) => {
    if (k === 'custom') setPeriod(customPeriod(period.start, period.end - 1));
    else {
      // Keep "today" when it's inside the current period, otherwise anchor on the period start.
      const now = Date.now();
      setPeriod(periodFor(k, now >= period.start && now < period.end ? now : period.start, weekStartsOn));
    }
  };

  return (
    <div className="space-y-2">
      <Segmented<PeriodKind> size="sm" value={period.kind} onChange={changeKind} options={[
        { value: 'day', label: t('period.day') },
        { value: 'week', label: t('period.week') },
        { value: 'month', label: t('period.month') },
        { value: 'year', label: t('period.year') },
        { value: 'custom', label: t('period.custom') },
      ]} />
      {period.kind === 'custom' ? (
        <div className="grid grid-cols-2 gap-2">
          <input type="date" className="input" aria-label={t('filters.from')} value={toDay(period.start)}
            onChange={(e) => e.target.value && setPeriod(customPeriod(fromDay(e.target.value), period.end - 1))} />
          <input type="date" className="input" aria-label={t('filters.to')} value={toDay(period.end - 1)}
            onChange={(e) => e.target.value && setPeriod(customPeriod(period.start, fromDay(e.target.value)))} />
        </div>
      ) : null}
      <div className="flex items-center gap-2">
        <button className="btn-ghost size-11 min-h-11 rounded-full p-0" onClick={() => setPeriod(shiftPeriod(period, -1, weekStartsOn))} aria-label={t('period.previous')}>
          <ChevronLeft className="size-6 rtl:rotate-180" />
        </button>
        <button className="flex-1 text-center text-lg font-bold" onClick={() => period.kind !== 'custom' && setPeriod(periodFor(period.kind, Date.now(), weekStartsOn))}>
          {periodLabel(period, fmt)}
        </button>
        <button className="btn-ghost size-11 min-h-11 rounded-full p-0 disabled:opacity-30" disabled={isFuture} onClick={() => setPeriod(shiftPeriod(period, 1, weekStartsOn))} aria-label={t('period.next')}>
          <ChevronRight className="size-6 rtl:rotate-180" />
        </button>
      </div>
    </div>
  );
}
