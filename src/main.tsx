import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './app/App';

if (
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  import.meta.env.MODE !== 'test'
) {
  void import('virtual:pwa-register').then(({ registerSW }) => {
    registerSW({ immediate: true });
  });
}

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Root element #root not found in document.');
}

createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
