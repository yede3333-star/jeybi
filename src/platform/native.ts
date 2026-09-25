// Android implementations (Capacitor plugins). Loaded only inside the Android app — see ./index.ts.
import { registerPlugin, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Share } from '@capacitor/share';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { LocalNotifications } from '@capacitor/local-notifications';
import { SplashScreen } from '@capacitor/splash-screen';
import { Camera, MediaTypeSelection } from '@capacitor/camera';
import { AndroidBiometryStrength, BiometricAuth, BiometryError, BiometryErrorType } from '@aparajita/capacitor-biometric-auth';
import { runBackHandler, setSharedText } from '.';
import { NOTIFY_IDS, type PlannedNotification } from '../services/notifyPlan';
import { logError } from '../services/errorLog';
import type { SpeechEngine } from '../services/dictation';

/** Our own small plugin (android/app/src/main/java/com/yede/jeybi/DownloadsPlugin.java). */
interface DownloadsPlugin {
  save(o: { filename: string; mimeType: string; data: string }): Promise<{ path: string }>;
}
const Downloads = registerPlugin<DownloadsPlugin>('JeybiDownloads');

/** Our plugin for "Share → Jeybi" (ShareInPlugin.java). */
interface ShareInPlugin {
  getPending(): Promise<{ text: string | null }>;
  addListener(event: 'sharedText', fn: () => void): Promise<{ remove: () => Promise<void> }>;
}
const ShareIn = registerPlugin<ShareInPlugin>('JeybiShareIn');

/** Shared text → the "اكتب يومك" screen (the lock screen still comes first when the app is locked). */
async function takeShared() {
  const { text } = await ShareIn.getPending();
  if (!text) return;
  setSharedText(text);
  location.hash = '#/write';
}

// ---------------- Start-up ----------------

let started = false;
export function initNative() {
  if (started) return;
  started = true;
  // index.html paints the same icon as the splash, so it can go as soon as JavaScript runs.
  void SplashScreen.hide().catch((e) => logError(e, 'native:splash'));
  void App.addListener('backButton', onBack);
  void takeShared().catch((e) => logError(e, 'native:share-in'));
  void ShareIn.addListener('sharedText', () => void takeShared().catch((e) => logError(e, 'native:share-in')));
  // The lock timer listens to this (visibilitychange is not reliable inside the Android WebView).
  void App.addListener('appStateChange', ({ isActive }) => {
    window.dispatchEvent(new CustomEvent('jeybi:app-active', { detail: isActive }));
  });
  void LocalNotifications.addListener('localNotificationActionPerformed', ({ notification }) => {
    const uri = (notification.extra as { shareUri?: string } | undefined)?.shareUri;
    // Tapping the weekly-backup notification opens the share sheet right away (Drive, WhatsApp…).
    if (uri) {
      shareUri(uri, notification.title)
        .then(async (r) => { if (r === 'shared') await (await import('../repo/backup')).markBackupDone(); })
        .catch((e) => logError(e, 'native:share-auto'));
    }
  });
}

let lastBackAt = 0;
function onBack() {
  if (runBackHandler()) return; // an open sheet / the lock screen handled it
  const path = location.hash.replace(/^#/, '') || '/';
  if (path === '/') {
    // Home: a second press within 2 s leaves the app (the first one shows a hint).
    if (Date.now() - lastBackAt < 2000) void App.exitApp();
    else {
      lastBackAt = Date.now();
      window.dispatchEvent(new CustomEvent('jeybi:exit-hint'));
    }
    return;
  }
  if (history.length > 1) history.back();
  else location.hash = '#/';
}

export const exitApp = () => App.exitApp();

const Privacy = registerPlugin<{ setSecure(o: { secure: boolean }): Promise<void> }>('JeybiPrivacy');
/** Privacy mode: blank in the recent-apps screen (and no screenshots) while on. */
export function setSecureScreen(secure: boolean) {
  void Privacy.setSecure({ secure }).catch((e) => logError(e, 'native:secure'));
}

/** Status bar / navigation bar icons readable on the app's own theme (not only the phone's). */
export function setSystemBarsDark(dark: boolean) {
  void SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch((e) => logError(e, 'native:bars'));
}

// ---------------- Files ----------------

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ''));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

const isCancel = (e: unknown) => /cancel/i.test(String((e as Error)?.message ?? e));

async function shareUri(uri: string, title: string): Promise<'shared' | 'cancelled'> {
  try {
    await Share.share({ title, dialogTitle: title, files: [uri] });
    return 'shared';
  } catch (e) {
    if (isCancel(e)) return 'cancelled';
    throw e;
  }
}

/** Writes the file to the app cache, then opens Android's share sheet (WhatsApp, Drive, e-mail…). */
export async function shareFile(blob: Blob, filename: string, title: string): Promise<'shared' | 'cancelled'> {
  const { uri } = await Filesystem.writeFile({ path: `share/${filename}`, data: await blobToBase64(blob), directory: Directory.Cache, recursive: true });
  return shareUri(uri, title);
}

export async function shareText(text: string, title: string): Promise<'shared' | 'cancelled'> {
  try {
    await Share.share({ title, dialogTitle: title, text });
    return 'shared';
  } catch (e) {
    if (isCancel(e)) return 'cancelled';
    throw e;
  }
}

/** Saves into the phone's Download/Jeybi folder; returns the path shown to the user. */
export async function saveToDownloads(blob: Blob, filename: string): Promise<string> {
  const { path } = await Downloads.save({ filename, mimeType: blob.type || 'application/octet-stream', data: await blobToBase64(blob) });
  return path;
}

// ---------------- Weekly encrypted backup (Documents/Jeybi) ----------------
// Documents is shared storage: the files stay when the app is uninstalled. On Android 11+ the app
// can only see the files it created itself, which is exactly what "keep the last 4" needs.

const AUTO_DIR = 'Jeybi';
const AUTO_PREFIX = 'jeybi-auto-';
export const AUTO_KEEP = 4;

export interface AutoBackupFile { name: string; uri: string; mtime: number; size: number }

export async function listAutoBackups(): Promise<AutoBackupFile[]> {
  try {
    const { files } = await Filesystem.readdir({ path: AUTO_DIR, directory: Directory.Documents });
    return files
      .filter((f) => f.type === 'file' && f.name.startsWith(AUTO_PREFIX))
      .map((f) => ({ name: f.name, uri: f.uri, mtime: Number(f.mtime ?? 0), size: f.size }))
      .sort((a, b) => b.name.localeCompare(a.name)); // names carry the date: newest first
  } catch {
    return []; // folder not created yet
  }
}

export async function writeAutoBackup(text: string, stamp: string): Promise<AutoBackupFile> {
  const name = `${AUTO_PREFIX}${stamp}.json`;
  const { uri } = await Filesystem.writeFile({ path: `${AUTO_DIR}/${name}`, data: text, directory: Directory.Documents, encoding: Encoding.UTF8, recursive: true });
  const all = await listAutoBackups();
  for (const old of all.slice(AUTO_KEEP)) {
    // A file left by a previous installation belongs to that installation: Android refuses to delete it. Not an error.
    await Filesystem.deleteFile({ path: `${AUTO_DIR}/${old.name}`, directory: Directory.Documents }).catch(() => {});
  }
  return { name, uri, mtime: Date.now(), size: text.length };
}

export const shareAutoBackup = (f: AutoBackupFile, title: string) => shareUri(f.uri, title);

export async function notifyAutoBackup(f: AutoBackupFile, title: string, body: string) {
  if ((await LocalNotifications.checkPermissions()).display !== 'granted') return;
  await ensureChannel();
  await LocalNotifications.schedule({
    notifications: [{ id: NOTIFY_IDS.autoBackup, title, body, channelId: CHANNEL, smallIcon: 'ic_stat_jeybi', iconColor: '#0f766e', extra: { shareUri: f.uri } }],
  });
}

// ---------------- Biometrics (BiometricPrompt) ----------------

export async function biometricAvailable(): Promise<boolean> {
  try {
    return (await BiometricAuth.checkBiometry()).isAvailable;
  } catch (e) {
    logError(e, 'bio:check');
    return false;
  }
}

const CANCELLED = new Set<string>([BiometryErrorType.userCancel, BiometryErrorType.appCancel, BiometryErrorType.systemCancel, BiometryErrorType.userFallback]);

/** 'cancelled' = the user chose the PIN; 'failed' = not recognised / locked out. Never throws. */
export async function biometricAuthenticate(o: { title: string; subtitle: string; cancel: string }): Promise<'ok' | 'cancelled' | 'failed'> {
  try {
    await BiometricAuth.authenticate({
      androidTitle: o.title,
      androidSubtitle: o.subtitle,
      cancelTitle: o.cancel,
      allowDeviceCredential: false, // the app's own PIN is the fallback
      androidConfirmationRequired: false, // face unlock opens straight away
      androidBiometryStrength: AndroidBiometryStrength.weak,
    });
    return 'ok';
  } catch (e) {
    const code = e instanceof BiometryError ? e.code : '';
    if (CANCELLED.has(code)) return 'cancelled';
    if (code !== BiometryErrorType.authenticationFailed && code !== BiometryErrorType.biometryLockout) logError(e, 'bio:native');
    return 'failed';
  }
}

// ---------------- Notifications ----------------

const CHANNEL = 'jeybi';
let channelReady = false;
async function ensureChannel(name = 'Jeybi') {
  if (channelReady) return;
  await LocalNotifications.createChannel({ id: CHANNEL, name, importance: 4, vibration: true });
  channelReady = true;
}

export async function notificationsGranted(): Promise<boolean> {
  return (await LocalNotifications.checkPermissions()).display === 'granted';
}

/** Android 13+ asks the user; older versions are allowed by default. */
export async function requestNotifications(): Promise<boolean> {
  return (await LocalNotifications.requestPermissions()).display === 'granted';
}

/** Replaces every pending notification with `plan` (debts, reminders, hawl). */
export async function syncNotifications(plan: PlannedNotification[], channelName: string) {
  const { notifications: pending } = await LocalNotifications.getPending();
  const stale = pending.filter((n) => n.id !== NOTIFY_IDS.autoBackup);
  if (stale.length) await LocalNotifications.cancel({ notifications: stale.map((n) => ({ id: n.id })) });
  if (!plan.length || !(await notificationsGranted())) return;
  await ensureChannel(channelName);
  // Exact alarms are allowed for this app (USE_EXACT_ALARM, not a Play Store app). Checking first
  // avoids the plugin opening the system "Alarms & reminders" screen on its own.
  const exact = (await LocalNotifications.checkExactNotificationSetting()).exact_alarm === 'granted';
  await LocalNotifications.schedule({
    notifications: plan.map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      channelId: CHANNEL,
      smallIcon: 'ic_stat_jeybi',
      iconColor: '#0f766e',
      isExactNotification: exact,
      schedule: { at: new Date(n.at), allowWhileIdle: true },
    })),
  });
}

export async function testNotification(title: string, body: string) {
  await ensureChannel();
  await LocalNotifications.schedule({
    notifications: [{ id: 1, title, body, channelId: CHANNEL, smallIcon: 'ic_stat_jeybi', iconColor: '#0f766e', schedule: { at: new Date(Date.now() + 1000), allowWhileIdle: true }, isExactNotification: false }],
  });
}

// ---------------- Receipt photo ----------------

/** null when the user cancelled. */
export async function pickPhoto(source: 'camera' | 'gallery'): Promise<Blob | null> {
  try {
    const r = source === 'camera'
      ? await Camera.takePhoto({ quality: 85, correctOrientation: true }) // resized by compressImage
      : (await Camera.chooseFromGallery({ mediaType: MediaTypeSelection.Photo, allowMultipleSelection: false })).results[0];
    if (!r?.webPath) return null;
    return await (await fetch(r.webPath)).blob();
  } catch (e) {
    if (isCancel(e) || /no image|no photo|not selected/i.test(String((e as Error)?.message))) return null;
    throw e;
  }
}

// ---------------- Voice input ("اكتب يومك") ----------------

export async function speechAvailable(): Promise<boolean> {
  try {
    const { SpeechRecognition } = await import('@capgo/capacitor-speech-recognition');
    return (await SpeechRecognition.available()).available;
  } catch {
    return false;
  }
}

/**
 * The phone's recogniser, inline (no Google dialog), for services/dictation.ts. Android ends a
 * session at every pause ("stopped", reason "silence"/"results"); the dictation restarts it.
 * The start/stop beep is muted where the phone allows it.
 */
export function androidSpeechEngine(): SpeechEngine {
  let handles: Array<{ remove: () => Promise<void> }> = [];
  let permitted = false;
  const clear = async () => {
    const old = handles;
    handles = [];
    for (const h of old) await h.remove().catch(() => {});
  };
  return {
    async start(lang, h) {
      const { SpeechRecognition } = await import('@capgo/capacitor-speech-recognition');
      if (!permitted) {
        if (!(await SpeechRecognition.available()).available) throw { code: 'unavailable' };
        if ((await SpeechRecognition.requestPermissions()).speechRecognition !== 'granted') throw { code: 'denied' };
        permitted = true;
      }
      await clear();
      let done = false; // one "end" per session: an error already handled suppresses the "stopped" after it
      handles.push(await SpeechRecognition.addListener('partialResults', (e) => {
        const t = e.matches?.[0];
        if (t) h.partial(t);
      }));
      handles.push(await SpeechRecognition.addListener('error', (e) => {
        const c = String(e.code ?? '');
        if (c === 'NO_MATCH' || c === 'SPEECH_TIMEOUT') return; // a pause: the "stopped" that follows restarts
        done = true;
        if (c === 'INSUFFICIENT_PERMISSIONS') h.error('denied');
        else if (/NETWORK|SERVER/.test(c)) h.error('network');
        else {
          logError(new Error(`speech ${c}: ${e.message}`), 'speech:native');
          h.error('other');
        }
      }));
      handles.push(await SpeechRecognition.addListener('listeningState', (e) => {
        if ((e.state === 'stopped' || e.status === 'stopped') && !done) {
          done = true;
          h.ended();
        }
      }));
      // With partialResults the call resolves as soon as listening starts; text comes as events.
      await SpeechRecognition.start({ language: lang, maxResults: 1, popup: false, partialResults: true, muteRecognizerBeep: true });
    },
    async stop() {
      const { SpeechRecognition } = await import('@capgo/capacitor-speech-recognition');
      await clear();
      await SpeechRecognition.stop().catch(() => {});
    },
  };
}
