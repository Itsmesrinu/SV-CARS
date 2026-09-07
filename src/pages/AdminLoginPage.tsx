/**
 * Admin sign-in.
 *
 * Deliberately outside `CustomerLayout` (P00 registered it that way in
 * `src/App.tsx`): `docs/admin-rules.md` requires admin surfaces to stay hidden
 * from customers, and the customer navbar has no business framing this page.
 *
 * One owner, one password, rotated with `npm run create:admin`. So there is no
 * sign-up and no forgot-password link — both would be dead ends.
 */

import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, Loader2, Lock } from 'lucide-react';
import { qk } from '@/src/hooks';
import { useAdminSession } from '@/src/components/admin/adminApi';
import { CARD, FIELD, BTN_PRIMARY } from '@/src/components/admin/adminStyles';

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { login, isLoggingIn } = useAdminSession();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (isLoggingIn) return;
    setError(null);

    try {
      await login(email.trim(), password);
      // The guard in App.tsx asks the API who we are; drop the cached answer so
      // it re-runs against the cookie we just received instead of a stale 401.
      await queryClient.invalidateQueries({ queryKey: qk.me });
      navigate('/admin', { replace: true });
    } catch (err) {
      setError(loginErrorMessage(err));
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center overflow-y-auto bg-surface-container-low px-4 py-8 md:px-6 md:py-12">
      <div className={`${CARD} w-full max-w-md p-6 md:p-8`}>
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-white shrink-0">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tighter text-slate-900">Admin Sign In</h1>
            <p className="text-slate-500 font-medium text-sm">Sri Venkateshwara Cars</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="admin-email" className="mb-2 block text-xs font-bold uppercase tracking-widest text-slate-500">
              Email
            </label>
            <input
              id="admin-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
              autoFocus
              className={`${FIELD} min-h-11`}
            />
          </div>

          <div>
            <label htmlFor="admin-password" className="mb-2 block text-xs font-bold uppercase tracking-widest text-slate-500">
              Password
            </label>
            <div className="relative">
              <input
                id="admin-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                className={`${FIELD} min-h-11 pr-12`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                className="absolute inset-y-0 right-0 inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-slate-500 transition-colors hover:text-primary active:scale-95"
              >
                {showPassword ? (
                  <EyeOff className="size-5" aria-hidden="true" />
                ) : (
                  <Eye className="size-5" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-500 font-bold">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isLoggingIn}
            className={`${BTN_PRIMARY} w-full flex items-center justify-center gap-2 py-3.5`}
          >
            {isLoggingIn && <Loader2 className="w-4 h-4 animate-spin" />}
            {isLoggingIn ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}

/**
 * A 401 gets ONE neutral message. P01 deliberately made the server refuse to
 * say whether the email exists; distinguishing the two here would hand that
 * information straight back.
 */
function loginErrorMessage(err: unknown): string {
  const e = err as { code?: string; status?: number; message?: string } | null;
  if (e?.code === 'invalid_credentials' || e?.status === 401) {
    return 'Incorrect email or password.';
  }
  if (e?.status && e.status >= 500) {
    return 'The server is not responding. Please try again in a moment.';
  }
  return e?.message?.trim() || 'Could not sign in. Please check your connection and try again.';
}
