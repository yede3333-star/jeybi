// Two-step file sharing: 1) prepare the file (can take a while), 2) the user taps "Share now" or
// "Download", and navigator.share()/download run directly inside that tap.
//
// Why: browsers only allow share() during a user gesture ("transient activation"). Preparing a backup
// or a PDF first and then calling share() lost that gesture, and Chrome on Android also refuses to
// share some file types (.json, .xlsx) — the old code fell back to a silent download that does not
// always work in an installed app, so nothing seemed to happen.
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Download, Loader2, Share2, TriangleAlert } from 'lucide-react';
import { Sheet } from './ui';
import { downloadBlob } from '../services/share';
import { errorMessage } from '../services/errors';
import { formatNumber } from '../lib/money';
import { useLang } from '../hooks/settings';

export interface PreparedFile {
  blob: Blob;
  filename: string;
  title: string;
  /** Name/type used for Web Share when the real type is not shareable on Android (e.g. JSON → .txt). */
  shareAs?: { filename: string; type: string };
}

type Outcome = 'shared' | 'downloaded';
type Open = (prepare: () => Promise<PreparedFile>, onDone?: (how: Outcome) => void) => void;

const Ctx = createContext<Open>(() => {});
export const useFileShare = () => useContext(Ctx);

interface State {
  phase: 'preparing' | 'ready' | 'error';
  file?: PreparedFile;
  shareFile?: File;
  canShare?: boolean;
  message?: { text: string; tone: 'ok' | 'warn' | 'error' };
  onDone?: (how: Outcome) => void;
}

function canShareFile(f: File): boolean {
  try {
    return typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [f] });
  } catch {
    return false;
  }
}

export function FileShareProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const lang = useLang();
  const [state, setState] = useState<State | null>(null);

  const open = useCallback<Open>((prepare, onDone) => {
    setState({ phase: 'preparing', onDone });
    prepare().then(
      (file) => {
        const shareFile = new File([file.blob], file.shareAs?.filename ?? file.filename, { type: file.shareAs?.type ?? file.blob.type });
        // closed while preparing = cancelled: do not reopen
        setState((cur) => cur && { phase: 'ready', file, shareFile, canShare: canShareFile(shareFile), onDone });
      },
      (e) => setState((cur) => cur && { phase: 'error', message: { text: errorMessage(e, t, 'share:prepare'), tone: 'error' } }),
    );
  }, [t]);

  // Result messages never reopen a sheet the user has already closed.
  const say = (text: string, tone: 'ok' | 'warn' | 'error') => setState((cur) => cur && { ...cur, message: { text, tone } });

  // Called synchronously from the click: the user gesture is still valid.
  const share = () => {
    if (!state?.shareFile || !state.file) return;
    navigator.share({ files: [state.shareFile], title: state.file.title }).then(
      () => { state.onDone?.('shared'); say(t('share.shared'), 'ok'); },
      (e: Error) => {
        if (e?.name === 'AbortError') say(t('share.cancelled'), 'warn');
        else say(`${errorMessage(e, t, 'share:share')} ${t('share.tryDownload')}`, 'error');
      },
    );
  };

  const download = () => {
    if (!state?.file) return;
    try {
      downloadBlob(state.file.blob, state.file.filename);
      state.onDone?.('downloaded');
      const standalone = matchMedia('(display-mode: standalone)').matches;
      say(t(standalone ? 'share.downloadStartedApp' : 'share.downloadStarted'), 'ok');
    } catch (e) {
      say(errorMessage(e, t, 'share:download'), 'error');
    }
  };

  const size = state?.file ? formatNumber(Math.max(1, Math.round(state.file.blob.size / 1024)) * 100, lang) : '';

  return (
    <Ctx.Provider value={open}>
      {children}
      <Sheet open={!!state} onClose={() => setState(null)} title={state?.file?.title ?? t('share.title')}>
        {state?.phase === 'preparing' && (
          <p className="flex items-center justify-center gap-2 py-8 text-muted"><Loader2 className="size-5 animate-spin" />{t('share.preparing')}</p>
        )}
        {state?.phase === 'ready' && state.file && (
          <div className="space-y-3">
            <p className="text-center text-sm text-muted"><bdi dir="ltr" className="font-semibold text-ink">{state.file.filename}</bdi> · <bdi dir="ltr" className="num">{size} KB</bdi></p>
            {state.canShare
              ? <button className="btn-primary w-full text-lg" onClick={share}><Share2 className="size-5" />{t('share.shareNow')}</button>
              : <p className="rounded-xl bg-black/5 p-3 text-sm text-muted dark:bg-white/5">{t('share.cannotShare')}</p>}
            <button className={`${state.canShare ? 'btn-soft' : 'btn-primary'} w-full`} onClick={download}><Download className="size-5" />{t('share.download')}</button>
          </div>
        )}
        {state?.message && (
          <p className={`mt-3 flex gap-2 rounded-xl p-3 text-sm ${
            state.message.tone === 'ok' ? 'bg-emerald-600/10 text-income' : state.message.tone === 'warn' ? 'bg-amber-100 text-amber-900 dark:bg-amber-400/15 dark:text-amber-200' : 'bg-red-600/10 text-red-700 dark:text-red-300'}`} role="status">
            {state.message.tone === 'ok' ? <CheckCircle2 className="size-5 shrink-0" /> : <TriangleAlert className="size-5 shrink-0" />}
            {state.message.text}
          </p>
        )}
      </Sheet>
    </Ctx.Provider>
  );
}
