import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { isSameDay, subDays } from 'date-fns';
import { dateLocale, formatMoney, formatNumber, formatPercent, currencyLabel, type Lang } from '../lib/money';
import { useLang, useSettings } from './settings';

export type DateStyle = 'short' | 'medium' | 'long' | 'dayMonth' | 'monthYear' | 'year' | 'weekday' | 'time' | 'dateTime';

const OPTS: Record<DateStyle, Intl.DateTimeFormatOptions> = {
  short: { day: '2-digit', month: '2-digit', year: 'numeric' },
  medium: { day: 'numeric', month: 'short', year: 'numeric' },
  long: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
  dayMonth: { day: 'numeric', month: 'short' },
  monthYear: { month: 'long', year: 'numeric' },
  year: { year: 'numeric' },
  weekday: { weekday: 'short' },
  time: { hour: '2-digit', minute: '2-digit', hour12: false },
  dateTime: { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false },
};

export function makeFormatters(lang: Lang, currency: string) {
  const dtf = new Map<DateStyle, Intl.DateTimeFormat>();
  const date = (ms: number, style: DateStyle = 'medium') => {
    let f = dtf.get(style);
    if (!f) {
      f = new Intl.DateTimeFormat(dateLocale(lang), { ...OPTS[style], numberingSystem: 'latn', calendar: 'gregory' } as Intl.DateTimeFormatOptions);
      dtf.set(style, f);
    }
    return f.format(ms);
  };
  return {
    lang,
    currency,
    currencyLabel: currencyLabel(currency, lang),
    money: (minor: number, opts?: { sign?: boolean; currency?: boolean }) => formatMoney(minor, lang, currency, opts),
    num: (minor: number) => formatNumber(minor, lang),
    pct: (v: number, digits = 0) => formatPercent(v, lang, digits),
    date,
  };
}

export type Formatters = ReturnType<typeof makeFormatters> & { dayLabel: (ms: number) => string };

export function useFmt(): Formatters {
  const lang = useLang();
  const { currency } = useSettings();
  const { t } = useTranslation();
  return useMemo(() => {
    const f = makeFormatters(lang, currency);
    const dayLabel = (ms: number) => {
      const now = new Date();
      if (isSameDay(ms, now)) return t('common.today');
      if (isSameDay(ms, subDays(now, 1))) return t('common.yesterday');
      return f.date(ms, 'long');
    };
    return { ...f, dayLabel };
  }, [lang, currency, t]);
}
