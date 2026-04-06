/**
 * useContractKpis
 *
 * Shared hook for accessing Promoter Contract KPIs.
 *
 * Designed to be consumed from any page — Dashboard, Admin overview,
 * Reports, and the full Contract Management page — without each caller
 * needing to know the tRPC procedure path or cache settings.
 *
 * React Query deduplicates concurrent calls with the same cache key, so
 * multiple consumers on the same render tree share a single network request.
 *
 * DERIVED VALUES (beyond the raw useQuery result)
 * ────────────────────────────────────────────────
 *   isPermissionError  — true when the server returned FORBIDDEN/UNAUTHORIZED;
 *                        the widget renders an "access restricted" state instead
 *                        of a generic error.
 *   errorCode          — the raw tRPC error code string, or null.
 *   invalidate()       — triggers a background refetch in all mounted consumers;
 *                        call this after any mutation that affects KPI numbers.
 *
 * INVALIDATION (without subscribing to data)
 * ───────────────────────────────────────────
 *   const utils = trpc.useUtils();
 *   void utils.contractManagement.kpis.invalidate();
 */

import { trpc } from "@/lib/trpc";

export type UseContractKpisOptions = {
  /** Disable the query entirely (e.g., user lacks access). Default: true. */
  enabled?: boolean;
  /**
   * How long (ms) the cached result is considered fresh.
   * Default: 60 000 ms (1 minute).
   */
  staleTime?: number;
  /** Re-run the query when the window regains focus. Default: false. */
  refetchOnWindowFocus?: boolean;
};

/**
 * Returns the standard tRPC useQuery result plus derived error helpers and
 * a convenience `invalidate()` function for post-mutation cache busting.
 */
export function useContractKpis(opts: UseContractKpisOptions = {}) {
  const {
    enabled = true,
    staleTime = 60_000,
    refetchOnWindowFocus = false,
  } = opts;

  const utils = trpc.useUtils();

  const query = trpc.contractManagement.kpis.useQuery(undefined, {
    enabled,
    staleTime,
    refetchOnWindowFocus,
    retry: 1,
  });

  // tRPC server errors carry a `data.code` field (e.g. "FORBIDDEN", "UNAUTHORIZED").
  // We cast through `unknown` to avoid depending on the full AppRouter type here.
  const errorCode =
    (query.error as { data?: { code?: string } } | null)?.data?.code ?? null;

  const isPermissionError =
    errorCode === "FORBIDDEN" || errorCode === "UNAUTHORIZED";

  return {
    ...query,
    /** Raw tRPC error code string, or null when there is no error. */
    errorCode,
    /**
     * True when the server explicitly denied access (FORBIDDEN / UNAUTHORIZED).
     * Use this to render an "access restricted" message rather than a generic
     * error — the distinction matters for surfaces like Dashboard where the
     * widget is shown speculatively and the user may not have HR access.
     */
    isPermissionError,
    /** Trigger a background refetch of the KPI cache (call after mutations). */
    invalidate: () => utils.contractManagement.kpis.invalidate(),
  };
}

/** Inferred type of the KPI payload (undefined when not yet loaded). */
export type ContractKpisData = NonNullable<
  ReturnType<typeof useContractKpis>["data"]
>;
