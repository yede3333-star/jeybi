import { useEffect, useState } from 'react';
import { format } from 'date-fns';

const key = () => format(Date.now(), 'yyyy-MM-dd');

/**
 * Current local day ("yyyy-MM-dd"). Changes at midnight, and when the app comes back to the
 * foreground on another day (a phone left overnight), so "today" and "this month" never go stale.
 */
export function useDayKey(): string {
  const [day, setDay] = useState(key);
  useEffect(() => {
    let timer: number;
    const schedule = () => {
      const now = new Date();
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
      timer = window.setTimeout(() => { setDay(key()); schedule(); }, next.getTime() - now.getTime());
    };
    const onVisible = () => { if (document.visibilityState === 'visible') setDay(key()); };
    schedule();
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, []);
  return day;
}

/** Current hour ("yyyy-MM-dd HH"): the daily reminder appears at the chosen hour while the app is open. */
export function useHourKey(): string {
  const hourKey = () => format(Date.now(), 'yyyy-MM-dd HH');
  const [hour, setHour] = useState(hourKey);
  useEffect(() => {
    const id = window.setInterval(() => setHour(hourKey()), 60_000);
    const onVisible = () => { if (document.visibilityState === 'visible') setHour(hourKey()); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
  }, []);
  return hour;
}
