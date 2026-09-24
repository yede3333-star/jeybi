import { Component, type ErrorInfo, type ReactNode } from 'react';
import i18n from '../i18n';
import { errorsAsText, logError } from '../services/errorLog';

/** Last line of defence: a screen that crashes shows a message (and is logged) instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean; copied: boolean }> {
  state = { failed: false, copied: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logError(Object.assign(error, { stack: `${error.stack ?? ''}\n${info.componentStack ?? ''}` }));
  }

  render() {
    if (!this.state.failed) return this.props.children;
    const t = i18n.t.bind(i18n);
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-page p-6 text-center">
        <p className="text-lg font-bold">{t('errors.crashTitle')}</p>
        <p className="text-sm text-muted">{t('errors.crashHint')}</p>
        <button className="btn-primary w-full max-w-xs" onClick={() => { location.hash = '#/'; location.reload(); }}>{t('errors.reload')}</button>
        <button className="btn-soft w-full max-w-xs" onClick={async () => {
          try { await navigator.clipboard.writeText(errorsAsText()); this.setState({ copied: true }); } catch { /* clipboard blocked */ }
        }}>{this.state.copied ? t('errorsPage.copied') : t('errorsPage.copy')}</button>
      </div>
    );
  }
}
