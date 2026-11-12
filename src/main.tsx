import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AppProvider } from './lib/store';
import './index.css';

// GitHub Pages serves 404.html for unknown paths. That page parks the original
// path in sessionStorage and bounces to the app root; restore it here without a
// second server round-trip.
try {
  const redirect = sessionStorage.getItem('toolatlas:redirect');
  if (redirect) {
    sessionStorage.removeItem('toolatlas:redirect');
    if (redirect.startsWith(import.meta.env.BASE_URL)) {
      window.history.replaceState(null, '', redirect);
    }
  }
} catch {
  /* sessionStorage can be unavailable in private modes */
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AppProvider>
        <App />
      </AppProvider>
    </BrowserRouter>
  </StrictMode>
);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      /* offline support is a bonus, never a requirement */
    });
  });
}
