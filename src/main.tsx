import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import './i18n';
import './index.css';
import App from './App';

// Service worker: caches the whole app so it works offline after the first load. A new version
// waits in the background; it takes over at the next launch, or right away if the user accepts
// the in-app "update ready" banner (see UpdateBanner in App.tsx).
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    window.dispatchEvent(new CustomEvent('jeybi:update-ready', { detail: updateSW }));
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
