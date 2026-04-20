import { describe, expect, it } from "vitest";
import {
  filterSanadQueueRowsByOwnerScope,
  generateSanadActionQueue,
  type SanadActionQueueGeneratorRow,
} from "./generateSanadActionQueue";

function row(p: Partial<SanadActionQueueGeneratorRow>): SanadActionQueueGeneratorRow {
  return {
    centerId: 1,
    centerName: "Alpha",
    governorateLabelRaw: "Muscat",
    isArchived: 0,
    contactNumber: "+9681",
    pipelineStatus: "invited",
    ownerUserId: null,
    nextActionDueAt: null,
    lastContactedAt: null,
    inviteSentAt: null,
    registeredUserId: null,
    linkedSanadOfficeId: null,
    onboardingStatus: "not_started",
    surveyOutreachReplyEmail: null,
    isInvalid: 0,
    isDuplicate: 0,
    pipelineOwnerName: null,
    pipelineOwnerEmail: null,
    ...p,
  };
}

describe("filterSanadQueueRowsByOwnerScope", () => {
  it("keeps unassigned and owned-by-viewer rows only for mine_and_unassigned", () => {
    const rows = [
      row({ centerId: 1, ownerUserId: null }),
      row({ centerId: 2, ownerUserId: 5 }),
      row({ centerId: 3, ownerUserId: 99 }),
    ];
    const f = filterSanadQueueRowsByOwnerScope(rows, "mine_and_unassigned", 5);
    expect(f.map((r) => r.centerId).sort()).toEqual([1, 2]);
  });

  it("passes all rows for all scope", () => {
    const rows = [row({ centerId: 1, ownerUserId: 99 })];
    expect(filterSanadQueueRowsByOwnerScope(rows, "all", 5)).toHaveLength(1);
  });
});

describe("generateSanadActionQueue", () => {
  const bucket = "2026-04-20";

  it("caps globally after sort", () => {
    const many: SanadActionQueueGeneratorRow[] = Array.from({ length: 30 }, (_, i) =>
      row({
        centerId: i + 1,
        centerName: `C${String(i + 1).padStart(2, "0")}`,
        ownerUserId: 1,
        pipelineStatus: "contacted",
        nextActionDueAt: "2026-04-19T00:00:00.000Z",
      }),
    );
    const ref = new Date("2026-04-20T12:00:00.000Z");
    const out = generateSanadActionQueue(many, ref, {
      limit: 10,
      dateBucketYmd: bucket,
      viewer: "operator",
    });
    expect(out).toHaveLength(10);
  });

  it("uses reviewer CTA policy without changing signal keys", () => {
    const ref = new Date("2026-04-20T12:00:00.000Z");
    const r = row({
      centerId: 1,
      ownerUserId: 1,
      pipelineStatus: "contacted",
      nextActionDueAt: "2026-04-19T00:00:00.000Z",
    });
    const op = generateSanadActionQueue([r], ref, { dateBucketYmd: bucket, viewer: "operator" });
    const rv = generateSanadActionQueue([r], ref, { dateBucketYmd: bucket, viewer: "reviewer" });
    expect(op[0]?.signalKey).toBe(rv[0]?.signalKey);
    expect(op[0]?.recommendedActionKey).not.toBe(rv[0]?.recommendedActionKey);
    expect(rv[0]?.ctaVariant).toBe("read_only");
    expect(rv[0]?.recommendedActionKey).toBe("view_in_directory");
  });

  it("midnight boundary: due today vs overdue (UTC day ids)", () => {
    const due = "2026-04-20T12:00:00.000Z";
    const snap = row({
      centerId: 50,
      centerName: "Boundary",
      ownerUserId: 1,
      pipelineStatus: "contacted",
      nextActionDueAt: due,
    });

    const justBefore = new Date("2026-04-20T23:59:59.000Z");
    const a = generateSanadActionQueue([snap], justBefore, {
      dateBucketYmd: "2026-04-20",
      viewer: "operator",
    });
    expect(a[0]?.signalKey).toBe("SANAD_DUE_TODAY");

    const justAfter = new Date("2026-04-21T00:00:01.000Z");
    const b = generateSanadActionQueue([snap], justAfter, {
      dateBucketYmd: "2026-04-21",
      viewer: "operator",
    });
    expect(b[0]?.signalKey).toBe("SANAD_OVERDUE_FOLLOWUP");
  });

  it("builds stable id with date bucket", () => {
    const ref = new Date("2026-04-20T12:00:00.000Z");
    const out = generateSanadActionQueue(
      [row({ centerId: 7, ownerUserId: null, pipelineStatus: "invited" })],
      ref,
      { dateBucketYmd: bucket, viewer: "operator" },
    );
    expect(out[0]?.id).toBe("sanad:7:SANAD_UNASSIGNED_PIPELINE:2026-04-20");
    expect(out[0]?.href).toBe("/admin/sanad/directory?highlight=7");
  });
});
