import type { ExecutiveCommitment } from "./commitmentTypes";
import type { ExecutiveReviewContext, ExecutiveReviewItem } from "./reviewTypes";
import { buildAccountabilityCheck, buildReviewItemTitle, buildReviewQuestion, buildReviewSignal } from "./reviewCopy";

/**
 * Operating review lens: one item per commitment (max 3), same order as commitments.
 * Context is reserved for future signal-aware copy; mapping is commitment-driven only.
 */
export function buildExecutiveReviewItems(
  commitments: ExecutiveCommitment[],
  _context: ExecutiveReviewContext,
): ExecutiveReviewItem[] {
  void _context;
  const out: ExecutiveReviewItem[] = [];
  const seen = new Set<string>();

  for (const c of commitments) {
    if (out.length >= 3) break;
    if (seen.has(c.id)) continue;
    seen.add(c.id);

    out.push({
      id: `review-${c.id}`,
      commitmentId: c.id,
      title: buildReviewItemTitle(c),
      reviewQuestion: buildReviewQuestion(c),
      accountabilityCheck: buildAccountabilityCheck(c),
      reviewSignal: buildReviewSignal(c),
      domain: c.domain,
      priority: c.priority,
    });
  }

  return out;
}
