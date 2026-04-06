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
 * multiple consumers on the same page share a single network request.
 *
 * INVALIDATION
 * ─────────────
 * Call `invalidate()` from any mutation that changes contract data to
 * trigger a background refetch in all mounted consumers:
 *
 *   const { invalidate } = useContractKpis();
 *   // or, without subscribing to data:
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
 * Returns the standard tRPC useQuery result plus a convenience
 * `invalidate()` function for post-mutation cache busting.
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

  return {
    ...query,
    /** Trigger a background refetch of the KPI cache (call after mutations). */
    invalidate: () => utils.contractManagement.kpis.invalidate(),
  };
}

/** Inferred type of the KPI payload (undefined when not yet loaded). */
export type ContractKpisData = NonNullable<
  ReturnType<typeof useContractKpis>["data"]
>;
