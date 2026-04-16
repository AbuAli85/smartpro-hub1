import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { TRPCClientError } from "@trpc/client";
import { useIsMutating } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo } from "react";

/** Shared across all `useAuth()` instances so layout shells show loading during sign-out. */
const AUTH_LOGOUT_MUTATION_KEY = ["auth", "logout"] as const;

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath = getLoginUrl() } =
    options ?? {};
  const utils = trpc.useUtils();

  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    mutationKey: AUTH_LOGOUT_MUTATION_KEY,
    onSuccess: () => {
      utils.auth.me.setData(undefined, null);
    },
  });

  const logoutInFlight = useIsMutating({ mutationKey: AUTH_LOGOUT_MUTATION_KEY });

  const logout = useCallback(async () => {
    try {
      await logoutMutation.mutateAsync();
    } catch (error: unknown) {
      if (
        error instanceof TRPCClientError &&
        error.data?.code === "UNAUTHORIZED"
      ) {
        // Already logged out server-side — proceed to redirect.
      } else {
        throw error;
      }
    } finally {
      // Clear local state immediately.
      try {
        localStorage.removeItem("manus-runtime-user-info");
      } catch {
        /* ignore private mode / SSR */
      }
      utils.auth.me.setData(undefined, null);
      // Force a hard redirect to the login page.
      // We do NOT call auth.me.invalidate() here because the session cookie
      // may still be present in the browser (e.g. due to domain/SameSite
      // attribute mismatch between the dev proxy and the cookie that was
      // originally set). A hard redirect ensures the browser drops the stale
      // React Query cache and the user lands on the login screen regardless.
      if (typeof window !== "undefined") {
        window.location.href = getLoginUrl();
      }
    }
  }, [logoutMutation, utils]);

  const state = useMemo(() => {
    return {
      user: meQuery.data ?? null,
      loading: meQuery.isLoading || logoutInFlight > 0,
      error: meQuery.error ?? logoutMutation.error ?? null,
      isAuthenticated: Boolean(meQuery.data),
    };
  }, [
    meQuery.data,
    meQuery.error,
    meQuery.isLoading,
    logoutInFlight,
    logoutMutation.error,
  ]);

  // Persist authenticated user info to localStorage for runtime access.
  // Only write when a real user object is present; the logout() function
  // is responsible for removing the key when the session ends.
  useEffect(() => {
    if (!meQuery.data) return;
    try {
      localStorage.setItem(
        "manus-runtime-user-info",
        JSON.stringify(meQuery.data)
      );
    } catch {
      /* ignore private mode / SSR */
    }
  }, [meQuery.data]);

  // Redirect to login when the session is confirmed absent.
  // Guard against the `idle` fetchStatus (query not yet attempted) to avoid
  // a premature redirect on the very first render before auth.me has resolved.
  useEffect(() => {
    if (!redirectOnUnauthenticated) return;
    if (meQuery.isLoading || logoutInFlight > 0) return;
    // `fetchStatus === "idle"` means the query has not been attempted yet —
    // do not treat this as "logged out".
    if (meQuery.fetchStatus === "idle") return;
    if (state.user) return;
    if (typeof window === "undefined") return;
    if (window.location.pathname === redirectPath) return;

    window.location.href = redirectPath;
  }, [
    redirectOnUnauthenticated,
    redirectPath,
    logoutInFlight,
    meQuery.isLoading,
    meQuery.fetchStatus,
    state.user,
  ]);

  return {
    ...state,
    refresh: () => meQuery.refetch(),
    logout,
  };
}
