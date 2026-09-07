import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {MotionConfig} from 'motion/react';
import App from './App.tsx';
import './index.css';

/**
 * One client for the whole app. Tuned for a catalogue that changes rarely:
 * - staleTime 60s matches the API's `s-maxage=60`, so navigating around the
 *   fleet does not refetch on every mount.
 * - no refetch on window focus: nothing here is live data, and refetching when
 *   the customer comes back from WhatsApp would be pure noise.
 * - retry twice: directly serves the "no errors on load" goal on flaky mobile
 *   connections.
 *
 * Admin reads deliberately bypass this caching at the fetch layer (`no-store`),
 * because docs/admin-rules.md requires the owner to see his own saves at once.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      retry: 2,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </MotionConfig>
  </StrictMode>,
);
