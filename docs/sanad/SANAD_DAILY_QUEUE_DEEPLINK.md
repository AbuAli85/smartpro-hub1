# SANAD daily action queue — directory deep link (Option C MVP)

**Contract (P2+):** queue rows return an `href` that lands operators on the SANAD directory with a stable centre highlight.

## Query parameter

| Parameter   | Meaning |
|-------------|---------|
| `highlight` | Intel centre id (`sanad_intel_centers.id`) — row / drawer context for P3. |

**Example:** `/admin/sanad/directory?highlight=42`

P3 may add scroll-to-row or drawer open; the minimum supported contract is this query pair so links remain bookmarkable and testable.
