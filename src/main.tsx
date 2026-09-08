import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {MotionConfig} from 'motion/react';
import App from './App.tsx';
import {ApiRequestError} from './lib/api';
import './index.css';

/**
 * One client for the whole app. Tuned for a catalogue that changes rarely:
 * - staleTime 60s matches the API's `s-maxage=60`, so navigating around the
 *   fleet does not refetch on every mount.
 * - no refetch on window focus: nothing here is live data, and refetching when
 *   the customer comes back from WhatsApp would be pure noise.
 * - retry only what can actually succeed on a second attempt — see below.
 *
 * Admin reads deliberately bypass this caching at the fetch layer (`no-store`),
 * because docs/admin-rules.md requires the owner to see his own saves at once.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      /**
       * Retries exist for flaky mobile connections, which is most of this
       * site's traffic — but a blanket `retry: 2` also retried the answers that
       * are already final. A bad car link meant three identical 404s spread
       * over ~3s of exponential backoff while the customer watched a skeleton,
       * because the query stays `isPending` until retries are exhausted.
       *
       * So: retry network failures (`status: 0`) and 5xx. Never retry a 4xx,
       * and never retry a non-JSON body — a misrouted `/api` route serving
       * `index.html` will not start serving JSON on the second attempt.
       */
      retry: (failureCount, error) => {
        if (error instanceof ApiRequestError) {
          if (error.code === 'invalid_response') return false;
          if (error.status >= 400 && error.status < 500) return false;
        }
        return failureCount < 2;
      },
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
