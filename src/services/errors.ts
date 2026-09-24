// Turns any failure into a message the user understands (both languages), and logs the unexpected ones.
import type { TFunction } from 'i18next';
import { ValidationError } from '../repo/transactions';
import { BackupError } from '../repo/backup';
import { logError } from './errorLog';

const KNOWN_DOM: Record<string, string> = {
  NotAllowedError: 'errors.notAllowed',
  AbortError: 'errors.cancelled',
  QuotaExceededError: 'errors.quota',
  NotReadableError: 'errors.notReadable',
  NotSupportedError: 'errors.notSupported',
  InvalidStateError: 'errors.invalidState',
  DataCloneError: 'errors.unexpected',
};

export function errorMessage(e: unknown, t: TFunction, where?: string): string {
  if (e instanceof ValidationError) {
    const k = `errors.${e.code}`;
    return t(k, { defaultValue: t('errors.unexpected') });
  }
  if (e instanceof BackupError) return t(`backup.errors.${e.message}`, { defaultValue: t('errors.unexpected') });
  const name = (e as { name?: string } | null)?.name;
  if (name && KNOWN_DOM[name]) {
    if (name !== 'AbortError') logError(e, where);
    return t(KNOWN_DOM[name]);
  }
  logError(e, where);
  return t('errors.unexpected');
}
