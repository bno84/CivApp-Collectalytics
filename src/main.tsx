import { StrictMode, useMemo, useRef, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

import { useBlockToken, useHostOrigin } from '@civitai/blocks-react';
import { injectBlocksStyles } from '@civitai/blocks-react/ui';

import { App } from './App.js';
import { createHttpClient } from './api.js';
import './index.css';

// The design-system pack's stylesheet: Civitai's tokens and component styles,
// themed by data-theme. Idempotent.
injectBlocksStyles();

/** The real API, on the validated host origin, with the host-minted block token. */
function LiveApp() {
  const origin = useHostOrigin();
  const token = useBlockToken();
  // Read at request time, so a refreshed token is used without rebuilding the client.
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const api = useMemo(() => createHttpClient({
    origin: origin ?? window.location.origin,
    getToken: () => tokenRef.current.raw || undefined,
    refreshToken: () => tokenRef.current.refresh(),
  }), [origin]);
  return <App api={api} />;
}

async function mount(): Promise<ReactNode> {
  // `pnpm run dev:harness`: a mock host and sample collections, never in production.
  if (import.meta.env.DEV && import.meta.env.VITE_DEV_HARNESS === 'true') {
    const { HarnessApp } = await import('./dev/harness.js');
    return <HarnessApp />;
  }
  return <LiveApp />;
}

const container = document.getElementById('root');
if (!container) throw new Error('#root missing from index.html');
mount().then(node => createRoot(container).render(<StrictMode>{node}</StrictMode>));
