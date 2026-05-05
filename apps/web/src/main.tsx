import './styles/index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app';
import { initSentry } from './lib/analytics/sentry';

// Run Sentry init BEFORE React mounts so it can catch first-render errors.
// No-op when VITE_SENTRY_DSN is unset (dev / preview default).
initSentry();

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root not found');

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
