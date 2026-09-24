import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bug, Copy, Gauge, Share2, Trash2 } from 'lucide-react';
import { PageHeader, Empty } from '../components/ui';
import { useToast } from '../components/Toast';
import { useFmt } from '../hooks/fmt';
import { clearErrors, errorsAsText, readErrors } from '../services/errorLog';
import { readStartup, startupAsText } from '../services/startupTiming';

export default function ErrorsPage() {
  const { t } = useTranslation();
  const fmt = useFmt();
  const toast = useToast();
  const [list, setList] = useState(readErrors);
  const [startup] = useState(readStartup);
  // What is copied/shared for the developer: errors, then open times.
  const report = () => [errorsAsText(list), startupAsText(startup)].filter(Boolean).join('\n\n');
  useEffect(() => {
    const on = () => setList(readErrors());
    window.addEventListener('jeybi:errors-changed', on);
    return () => window.removeEventListener('jeybi:errors-changed', on);
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(report());
      toast({ message: t('errorsPage.copied') });
    } catch {
      toast({ message: t('errorsPage.copyFailed'), tone: 'error' });
    }
  };
  // Text sharing is allowed everywhere (unlike some file types), e.g. straight to WhatsApp.
  const share = async () => {
    try {
      await navigator.share({ title: 'Jeybi errors', text: report() });
    } catch (e) {
      if ((e as Error).name !== 'AbortError') void copy();
    }
  };

  return (
    <div>
      <PageHeader back title={t('errorsPage.title')} />
      <div className="space-y-3 px-4">
        <p className="px-1 text-sm text-muted">{t('errorsPage.hint')}</p>
        {(list.length > 0 || startup.length > 0) && (
          <div className="grid grid-cols-3 gap-2">
            <button className="btn-soft" onClick={copy}><Copy className="size-4" />{t('errorsPage.copy')}</button>
            <button className="btn-soft" disabled={typeof navigator.share !== 'function'} onClick={share}><Share2 className="size-4" />{t('errorsPage.share')}</button>
            <button className="btn-danger" disabled={list.length === 0} onClick={() => { clearErrors(); toast({ message: t('errorsPage.cleared') }); }}><Trash2 className="size-4" />{t('errorsPage.clear')}</button>
          </div>
        )}
        {list.length === 0 ? <Empty icon={<Bug className="size-10" />} title={t('errorsPage.empty')} /> : (
          <>
            <div className="card divide-y divide-line">
              {list.map((e, i) => (
                <div key={i} className="px-4 py-3 text-sm" dir="ltr">
                  <div className="flex justify-between gap-2 text-xs text-muted">
                    <span className="num">{fmt.date(e.at, 'dateTime')}</span>
                    <span>{e.screen} · {e.mode}</span>
                  </div>
                  <p className="mt-1 break-words font-mono text-xs"><b>{e.kind}</b>: {e.message}</p>
                </div>
              ))}
            </div>
          </>
        )}
        {startup.length > 0 && (
          <section className="card p-4">
            <h2 className="flex items-center gap-2 font-bold"><Gauge className="size-5 text-muted" />{t('errorsPage.startupTitle')}</h2>
            <p className="mt-1 text-xs text-muted">{t('errorsPage.startupHint')}</p>
            <div className="mt-2 divide-y divide-line text-sm">
              {startup.map((e) => (
                <div key={e.at} className="flex flex-wrap items-center justify-between gap-x-3 py-2">
                  <span className="text-xs text-muted"><span className="num">{fmt.date(e.at, 'dateTime')}</span> · {t(e.mode === 'standalone' ? 'errorsPage.installed' : 'errorsPage.browser')}</span>
                  <span>
                    {t(e.first === 'lock' ? 'errorsPage.firstLock' : 'errorsPage.firstHome')} <bdi dir="ltr" className="num font-semibold">{t('errorsPage.ms', { n: e.firstMs })}</bdi>
                    {e.unlockToHomeMs != null && <> · {t(e.unlock === 'bio' ? 'errorsPage.afterBio' : 'errorsPage.afterPin')} <bdi dir="ltr" className="num font-semibold">{t('errorsPage.ms', { n: e.unlockToHomeMs })}</bdi></>}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
