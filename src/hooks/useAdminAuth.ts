/**
 * Admin session — CONTRACT.md §10.
 *
 * Owned by P03, consumed by P04's login screen and route guard.
 *
 * `retry: false` on the `me` query is the important line: a `401` is a
 * legitimate answer meaning "not signed in", not a transient failure. With the
 * app-wide `retry: 2` default, every signed-out visit to /admin would fire three
 * requests and hold the login screen behind a spinner while they ran.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { api, ApiRequestError } from '@/src/lib/api';
import { qk } from './queryKeys';

export interface LoginVars {
  email: string;
  password: string;
}

export interface AdminAuth {
  /** The `qk.me` query: `data` is `{ email }` when signed in, `undefined` on 401. */
  me: UseQueryResult<{ email: string }, ApiRequestError>;
  /** True once the session query has settled and returned an email. */
  isAuthenticated: boolean;
  /** True while the first `me` request is in flight — render nothing decisive until it clears. */
  isPending: boolean;
  login: UseMutationResult<void, ApiRequestError, LoginVars>;
  logout: UseMutationResult<void, ApiRequestError, void>;
}

export function useAdminAuth(): AdminAuth {
  const client = useQueryClient();

  const me = useQuery<{ email: string }, ApiRequestError>({
    queryKey: qk.me,
    queryFn: () => api.me(),
    retry: false,
    // The cookie can expire or be cleared in another tab; re-check on remount.
    staleTime: 0,
  });

  const login = useMutation<void, ApiRequestError, LoginVars>({
    mutationFn: ({ email, password }) => api.login(email, password),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: qk.me });
    },
  });

  const logout = useMutation<void, ApiRequestError, void>({
    mutationFn: () => api.logout(),
    onSuccess: () => {
      // Drop the cached identity immediately, then refetch to confirm the 401.
      client.setQueryData(qk.me, undefined);
      void client.invalidateQueries({ queryKey: qk.me });
    },
  });

  return {
    me,
    isAuthenticated: !!me.data?.email,
    isPending: me.isPending,
    login,
    logout,
  };
}