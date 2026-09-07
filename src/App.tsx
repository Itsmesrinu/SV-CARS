/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Routes, Route, useLocation, Link, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import HomePage from './pages/HomePage';
import AllCarsPage from './pages/AllCarsPage';
import CarDetailsPage from './pages/CarDetailsPage';
import BookingPage from './pages/BookingPage';
import AdminPage from './pages/AdminPage';
import AdminLoginPage from './pages/AdminLoginPage';
import AdminAvailabilityPage from './pages/AdminAvailabilityPage';
import { EmptyState } from './components/ui';
import { MobileActionBar } from './components/layout';

function ScrollToTop() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (hash) {
      const el = document.querySelector(hash);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
        return;
      }
    }
    // `behavior: 'instant'` overrides the global `scroll-behavior: smooth` (added
    // for in-page anchor links). Without it a route change tries to *animate* to
    // the top, and the details page growing as its data loads interrupts that
    // scroll mid-flight — leaving the reader parked at the booking section
    // instead of the car photos.
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname, hash]);

  return null;
}

function CustomerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col selection:bg-primary selection:text-white">
      <Navbar />
      <main id="main" tabIndex={-1} className="flex-1">{children}</main>
      <Footer />
      <MobileActionBar />
    </div>
  );
}

/**
 * Session gate for /admin.
 *
 * Deliberately dependency-light and defined here rather than in its own file:
 * src/App.tsx is owned by P00 alone, so keeping the guard inside it means the
 * admin session (P04) and the app shell never need to edit the same file.
 *
 * Asks the API who we are instead of trusting anything in the browser — the
 * session cookie is httpOnly, so JS cannot read it by design.
 */
function RequireAdmin({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<'pending' | 'ok' | 'anonymous'>('pending');

  useEffect(() => {
    let active = true;

    fetch('/api/admin/me', { credentials: 'same-origin', cache: 'no-store' })
      .then((res) => {
        if (!active) return;
        setState(res.ok ? 'ok' : 'anonymous');
      })
      .catch(() => {
        // Network/API down: fail closed. The login page is the safe landing spot.
        if (active) setState('anonymous');
      });

    return () => {
      active = false;
    };
  }, []);

  // Render nothing while pending: no flash of the dashboard, no flash of login.
  if (state === 'pending') return null;
  if (state === 'anonymous') return <Navigate to="/admin/login" replace />;
  return <>{children}</>;
}

function NotFoundPage() {
  return (
    <div>
      <h1 className="sr-only">Page Not Found</h1>
      <EmptyState
        title="Page Not Found"
        description="The page you're looking for doesn't exist."
        action={(
          <Link
            to="/"
            className="inline-flex min-h-12 items-center justify-center rounded-xl bg-primary px-6 py-3 font-bold text-white transition-colors hover:bg-primary/90 active:scale-95"
          >
            Back to Home
          </Link>
        )}
      />
    </div>
  );
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<CustomerLayout><HomePage /></CustomerLayout>} />
        <Route path="/all-cars" element={<CustomerLayout><AllCarsPage /></CustomerLayout>} />
        <Route path="/car/:id" element={<CustomerLayout><CarDetailsPage /></CustomerLayout>} />
        <Route path="/booking" element={<CustomerLayout><BookingPage /></CustomerLayout>} />

        {/*
          Admin is intentionally outside CustomerLayout: docs/admin-rules.md
          requires admin controls to stay invisible to customers, and the
          customer navbar has no business framing the dashboard.
        */}
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/admin" element={<RequireAdmin><AdminPage /></RequireAdmin>} />
        {/* Fleet availability calendar (CONTRACT.md §16.7). Registered here so
            neither P04 nor P09 has to touch routing; P09 replaces the stub. */}
        <Route
          path="/admin/availability"
          element={<RequireAdmin><AdminAvailabilityPage /></RequireAdmin>}
        />

        <Route path="*" element={<CustomerLayout><NotFoundPage /></CustomerLayout>} />
      </Routes>
    </>
  );
}
