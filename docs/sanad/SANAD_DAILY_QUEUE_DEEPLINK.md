# SANAD daily action queue — directory deep link (Option C MVP)

**Contract (P2+):** queue rows return an `href` that lands operators on the SANAD directory with a stable centre highlight.

## Query parameter

| Parameter   | Meaning |
|-------------|---------|
| `highlight` | Intel centre id (`sanad_intel_centers.id`) — row / drawer context for P3. |

**Example:** `/admin/sanad/directory?highlight=42`

P3 opens the directory **drawer** for the centre, scrolls the row into view when it is on the current page, then **removes** `highlight` via `history.replaceState` so refreshes do not re-trigger the same deep link.

P3 may extend scroll/drawer behaviour further; the minimum supported contract remains this query pair so links stay bookmarkable and testable.
