// Open times measured on the device itself (shown in Settings → Error log), so "the installed app
// is slower" can be checked with real numbers from the phone rather than guessed on a computer.
// Only timings and the display mode are stored — nothing about the user's data.

const KEY = 'jeybi:startup';
const MAX = 10;

export interface StartupEntry {
  at: number;
  mode: 'standalone' | 'browser';
  /** First screen painted: the lock screen, or the home screen when there is no PIN. */
  first: 'lock' | 'home';
  /** ms from launch (navigation start) to that first paint. */
  firstMs: number;
  /** How the app was unlocked, and ms from the unlock (PIN checked / biometric accepted) to the home screen. */
  unlock?: 'pin' | 'bio';
  unlockToHomeMs?: number;
}

let entry: StartupEntry | null = null;
let unlockStart: number | null = null;

export function readStartup(): StartupEntry[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function save() {
  if (!entry) return;
  try {
    const rest = readStartup().filter((e) => e.at !== entry!.at);
    localStorage.setItem(KEY, JSON.stringify([entry, ...rest].slice(0, MAX)));
  } catch { /* private mode */ }
}

/** Runs after the browser has actually painted the frame. */
const afterPaint = (fn: () => void) => requestAnimationFrame(() => setTimeout(fn, 0));

/** Called by the first screen of this launch (only the first call counts). */
export function markFirstScreen(first: 'lock' | 'home') {
  if (entry) return;
  entry = {
    at: Date.now(),
    mode: matchMedia('(display-mode: standalone)').matches ? 'standalone' : 'browser',
    first,
    firstMs: 0,
  };
  const e = entry;
  afterPaint(() => { e.firstMs = Math.round(performance.now()); save(); });
}

export function markUnlockStart(how: 'pin' | 'bio') {
  // a wrong PIN followed by a right one: the last attempt counts
  if (entry && entry.first === 'lock' && entry.unlockToHomeMs == null) {
    entry.unlock = how;
    unlockStart = performance.now();
  }
}

/** Called when the home screen shows its data. */
export function markHomeReady() {
  if (!entry) { markFirstScreen('home'); return; }
  if (unlockStart == null || entry.unlockToHomeMs != null) return;
  const e = entry, start = unlockStart;
  afterPaint(() => { e.unlockToHomeMs = Math.round(performance.now() - start); save(); });
}

export function startupAsText(list = readStartup()): string {
  return list.map((e) => `${new Date(e.at).toISOString()} [${e.mode}] ${e.first} ${e.firstMs}ms` +
    (e.unlockToHomeMs != null ? ` · ${e.unlock} → home ${e.unlockToHomeMs}ms` : '')).join('\n');
}
