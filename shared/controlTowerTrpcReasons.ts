/**
 * Stable machine-readable markers on tRPC error `data.reason`
 * (via root `errorFormatter` + `TRPCError.cause.reason`).
 *
 * Use for client-side branching — never match on free-text `message`.
 */

/** Returned when resolveItem is attempted but the source module condition is still active. */
export const CONTROL_TOWER_SOURCE_STILL_ACTIVE =
  "CONTROL_TOWER_SOURCE_STILL_ACTIVE" as const;
