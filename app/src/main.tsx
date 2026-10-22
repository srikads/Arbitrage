import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { normaliseLocal } from './lib/config';
import type { Feed } from './lib/types';
import { AppProvider } from './state/AppContext';
import type { LocalData } from './lib/config';
import './styles/base.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/controls.css';
import './styles/screens.css';
import './styles/detail.css';
import './styles/forms.css';
import './styles/onboarding.css';
import './styles/add.css';
import './styles/markdown.css';

const DEMO_ENABLED = import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO === '1';

async function loadDemo(): Promise<{ local: LocalData; feed: Feed } | null> {
  if (!DEMO_ENABLED) return null;
  if (new URLSearchParams(window.location.search).get('demo') !== '1') return null;
  const { demoData } = await import('./demo/demoData');
  const { config, feed } = demoData();
  return { local: normaliseLocal({ config, onboarded: true }), feed };
}

async function registerServiceWorker() {
  if (import.meta.env.DEV || !('serviceWorker' in navigator)) return;
  const { registerSW } = await import('virtual:pwa-register');
  registerSW({ immediate: true });
}

void (async () => {
  const demo = await loadDemo();
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <AppProvider demo={demo}>
        <App />
      </AppProvider>
    </StrictMode>,
  );
  if (!demo) void registerServiceWorker();
})();
