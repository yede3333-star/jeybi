import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { i18nReady } from './i18n';
import './index.css';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { installGlobalErrorHandlers } from './services/errorLog';

installGlobalErrorHandlers();

// Service worker: caches the whole app so it works offline after the first load. A new version
// waits in the background; it takes over at the next launch, or right away if the user accepts
// the in-app "update ready" banner (see UpdateBanner in App.tsx).
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    window.dispatchEvent(new CustomEvent('jeybi:update-ready', { detail: updateSW }));
  },
});

// The static shell in index.html stays on screen while the (single) dictionary loads.
void i18nReady.finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
});
