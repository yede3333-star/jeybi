// Local error log (Settings → Error log) so problems on the user's phone can be sent to the developer.
// Stored in localStorage (works even if IndexedDB is the thing failing), last 50 entries, and never
// holds financial data: long numbers are masked, and only the route path (no query) is kept.

import { displayMode } from '../platform';

const KEY = 'jeybi:errors';
const MAX = 50;

export interface LoggedError {
  at: number;
  screen: string;
  kind: string;
  message: string;
  stack?: string;
  version: string;
  mode: 'android' | 'standalone' | 'browser';
  lang: string;
}

/** Masks anything that could be an amount, a balance or a phone number. */
const mask = (s: string) => s.replace(/\d[\d\s.,]{2,}\d/g, '#').replace(/\d{3,}/g, '#');

function describe(err: unknown): { kind: string; message: string; stack?: string } {
  if (err instanceof Error) {
    const code = (err as { code?: string }).code;
    return {
      kind: err.name + (code ? `:${code}` : ''),
      message: err.message,
      // file:line:col only, no URLs with data
      stack: err.stack?.split('\n').slice(1, 6).map((l) => l.trim().replace(/\(?https?:\/\/[^)\s]*\/([^/)\s]+)\)?/g, '$1')).join(' | '),
    };
  }
  return { kind: typeof err, message: String(err) };
}

export function readErrors(): LoggedError[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function logError(err: unknown, where?: string): void {
  try {
    const d = describe(err);
    const entry: LoggedError = {
      at: Date.now(),
      screen: where ?? (location.hash.split('?')[0] || '#/'),
      kind: d.kind.slice(0, 60),
      message: mask(d.message).slice(0, 300),
      stack: d.stack ? mask(d.stack).slice(0, 500) : undefined,
      version: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '?',
      mode: displayMode(),
      lang: document.documentElement.lang,
    };
    localStorage.setItem(KEY, JSON.stringify([entry, ...readErrors()].slice(0, MAX)));
    window.dispatchEvent(new Event('jeybi:errors-changed'));
  } catch {
    /* logging must never throw */
  }
}

export function clearErrors(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  window.dispatchEvent(new Event('jeybi:errors-changed'));
}

export function errorsAsText(list = readErrors()): string {
  const ua = navigator.userAgent.replace(/\s+/g, ' ');
  return [`Jeybi ${list[0]?.version ?? ''} — ${ua}`, ...list.map((e) =>
    `${new Date(e.at).toISOString()} [${e.mode}/${e.lang}] ${e.screen} ${e.kind}: ${e.message}${e.stack ? `\n    ${e.stack}` : ''}`)].join('\n');
}

/** Catches everything that escapes the app's own error handling. */
export function installGlobalErrorHandlers(): void {
  window.addEventListener('error', (e) => {
    if (e.error || e.message) {
      logError(e.error ?? new Error(e.message), undefined);
      window.dispatchEvent(new Event('jeybi:unexpected-error'));
    }
  });
  window.addEventListener('unhandledrejection', (e) => {
    logError(e.reason, undefined);
    window.dispatchEvent(new Event('jeybi:unexpected-error'));
  });
}
