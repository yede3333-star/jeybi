import type { CapacitorConfig } from '@capacitor/cli';

// The Android app loads the same web build (dist/) from inside the APK: no server, works offline.
//
// NEVER change appId, server.hostname or server.androidScheme: the app's IndexedDB belongs to the
// origin https://localhost — a different origin after an update would start with an empty database.
const config: CapacitorConfig = {
  appId: 'com.yede.jeybi',
  appName: 'جيبي',
  webDir: 'dist',
  server: { androidScheme: 'https', hostname: 'localhost' },
  android: {
    // Release builds never allow Chrome DevTools to attach (data is private).
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SplashScreen: {
      // Hidden from JavaScript as soon as the app starts (platform/native.ts); this is only a safety net.
      launchShowDuration: 3000,
      launchAutoHide: true,
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_jeybi',
      iconColor: '#0f766e',
    },
  },
};

export default config;
