// Platform layer: the same code runs as a web app (GitHub Pages / PWA) and inside the Android app
// (Capacitor). Components ask `isNative` and, only on Android, load the native implementations from
// ./native — the web bundle never downloads the Capacitor plugins.
import { Capacitor } from '@capacitor/core';

export const isNative = Capacitor.isNativePlatform();

type Native = typeof import('./native');
let nativeModule: Promise<Native> | null = null;
/** The Android implementations (plugins). Only call when `isNative`. */
export function native(): Promise<Native> {
  if (!isNative) return Promise.reject(new Error('native() called on the web'));
  return (nativeModule ??= import('./native'));
}

/** Where the weekly encrypted backups are kept (shown to the user). */
export const AUTO_BACKUP_FOLDER = 'Documents/Jeybi';
/** Where "Save to Downloads" puts files (shown to the user). */
export const DOWNLOADS_FOLDER = 'Download/Jeybi';

// ---------------- Back button (Android) ----------------
// Open sheets register a handler: the hardware back button closes the top one instead of leaving the page.
const backStack: Array<() => void> = [];

export function pushBackHandler(fn: () => void): () => void {
  backStack.push(fn);
  return () => {
    const i = backStack.lastIndexOf(fn);
    if (i >= 0) backStack.splice(i, 1);
  };
}

/** Runs the top handler; false when there is none (the page itself should go back). */
export function runBackHandler(): boolean {
  const fn = backStack[backStack.length - 1];
  if (!fn) return false;
  fn();
  return true;
}

/** For the error log and start-up timings: which kind of app this is. */
export function displayMode(): 'android' | 'standalone' | 'browser' {
  if (isNative) return 'android';
  return matchMedia('(display-mode: standalone)').matches ? 'standalone' : 'browser';
}
