import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import './i18n';
import './index.css';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { installGlobalErrorHandlers } from './services/errorLog';
import { isNative, native } from './platform';

installGlobalErrorHandlers();

// Service worker (web only): caches the whole app so it works offline after the first load. A new
// version waits in the background; it takes over at the next launch, or right away if the user accepts
// the in-app "update ready" banner (see UpdateBanner in App.tsx).
// The Android app has its files inside the APK: no service worker there, updates come with a new APK.
if (isNative) {
  void native().then((n) => n.initNative());
} else {
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      window.dispatchEvent(new CustomEvent('jeybi:update-ready', { detail: updateSW }));
    },
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
