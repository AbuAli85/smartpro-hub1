import { describe, expect, it } from "vitest";
import type { SanadQueueListSourceRow } from "./sanadQueueRowMapping";
import { mapListCentersRowToSnapshot } from "./sanadQueueRowMapping";

function baseCenter(over: Partial<SanadQueueListSourceRow["center"]> = {}): SanadQueueListSourceRow["center"] {
  return {
    id: 1,
    importBatchId: null,
    sourceFingerprint: "fp",
    centerName: "Test Centre",
    responsiblePerson: null,
    contactNumber: "+968",
    governorateKey: "muscat",
    governorateLabelRaw: "Muscat",
    wilayat: null,
    village: null,
    rawRow: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
}

describe("mapListCentersRowToSnapshot", () => {
  it("does not set office flags when not linked", () => {
    const row: SanadQueueListSourceRow = {
      center: baseCenter(),
      ops: {
        centerId: 1,
        partnerStatus: "unknown",
        onboardingStatus: "not_started",
        complianceOverall: "not_assessed",
        internalTags: [],
        notes: null,
        internalReviewNotes: null,
        assignedManagerUserId: null,
        latitude: null,
        longitude: null,
        coverageRadiusKm: null,
        targetSlaHours: null,
        updatedAt: new Date(),
        inviteToken: null,
        inviteSentAt: null,
        inviteExpiresAt: null,
        registeredUserId: null,
        linkedSanadOfficeId: null,
        activatedAt: null,
        activationSource: "manual",
        lastContactedAt: null,
        contactMethod: null,
        followUpDueAt: null,
        inviteAcceptName: null,
        inviteAcceptPhone: null,
        inviteAcceptEmail: null,
        surveyOutreachReplyEmail: null,
        inviteAcceptAt: null,
      },
      pipeline: {
        centerId: 1,
        pipelineStatus: "imported",
        ownerUserId: null,
        lastContactedAt: null,
        nextAction: null,
        nextActionType: null,
        nextActionDueAt: null,
        assignedAt: null,
        assignedByUserId: null,
        latestNotePreview: null,
        isArchived: 0,
        isInvalid: 0,
        isDuplicate: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      pipelineOwnerName: null,
      pipelineOwnerEmail: null,
      linkedOfficeIsPublicListed: null,
      linkedOfficeHasActiveCatalogue: null,
      rosterSoloOwnerOnly: null,
    };
    const snap = mapListCentersRowToSnapshot(row);
    expect(snap.officeIsPublicListed).toBeUndefined();
    expect(snap.officeHasActiveCatalogue).toBeUndefined();
    expect(snap.rosterIsSoloOwnerOnly).toBeUndefined();
  });

  it("sets office flags only when all three SQL facts are non-null for a linked office", () => {
    const row: SanadQueueListSourceRow = {
      center: baseCenter({ id: 2 }),
      ops: {
        centerId: 2,
        partnerStatus: "active",
        onboardingStatus: "not_started",
        complianceOverall: "not_assessed",
        internalTags: [],
        notes: null,
        internalReviewNotes: null,
        assignedManagerUserId: null,
        latitude: null,
        longitude: null,
        coverageRadiusKm: null,
        targetSlaHours: null,
        updatedAt: new Date(),
        inviteToken: null,
        inviteSentAt: null,
        inviteExpiresAt: null,
        registeredUserId: 9,
        linkedSanadOfficeId: 100,
        activatedAt: new Date(),
        activationSource: "manual",
        lastContactedAt: null,
        contactMethod: null,
        followUpDueAt: null,
        inviteAcceptName: null,
        inviteAcceptPhone: null,
        inviteAcceptEmail: null,
        surveyOutreachReplyEmail: null,
        inviteAcceptAt: null,
      },
      pipeline: {
        centerId: 2,
        pipelineStatus: "active",
        ownerUserId: 1,
        lastContactedAt: null,
        nextAction: null,
        nextActionType: null,
        nextActionDueAt: null,
        assignedAt: null,
        assignedByUserId: null,
        latestNotePreview: null,
        isArchived: 0,
        isInvalid: 0,
        isDuplicate: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      pipelineOwnerName: "Owner",
      pipelineOwnerEmail: null,
      linkedOfficeIsPublicListed: 0,
      linkedOfficeHasActiveCatalogue: 0,
      rosterSoloOwnerOnly: 0,
    };
    const snap = mapListCentersRowToSnapshot(row);
    expect(snap.officeIsPublicListed).toBe(false);
    expect(snap.officeHasActiveCatalogue).toBe(false);
    expect(snap.rosterIsSoloOwnerOnly).toBe(false);
  });

  it("does not set office flags when linked id set but SQL facts incomplete (orphan)", () => {
    const row: SanadQueueListSourceRow = {
      center: baseCenter({ id: 3 }),
      ops: {
        centerId: 3,
        partnerStatus: "active",
        onboardingStatus: "not_started",
        complianceOverall: "not_assessed",
        internalTags: [],
        notes: null,
        internalReviewNotes: null,
        assignedManagerUserId: null,
        latitude: null,
        longitude: null,
        coverageRadiusKm: null,
        targetSlaHours: null,
        updatedAt: new Date(),
        inviteToken: null,
        inviteSentAt: null,
        inviteExpiresAt: null,
        registeredUserId: 9,
        linkedSanadOfficeId: 99999,
        activatedAt: new Date(),
        activationSource: "manual",
        lastContactedAt: null,
        contactMethod: null,
        followUpDueAt: null,
        inviteAcceptName: null,
        inviteAcceptPhone: null,
        inviteAcceptEmail: null,
        surveyOutreachReplyEmail: null,
        inviteAcceptAt: null,
      },
      pipeline: {
        centerId: 3,
        pipelineStatus: "active",
        ownerUserId: 1,
        lastContactedAt: null,
        nextAction: null,
        nextActionType: null,
        nextActionDueAt: null,
        assignedAt: null,
        assignedByUserId: null,
        latestNotePreview: null,
        isArchived: 0,
        isInvalid: 0,
        isDuplicate: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      pipelineOwnerName: null,
      pipelineOwnerEmail: null,
      linkedOfficeIsPublicListed: null,
      linkedOfficeHasActiveCatalogue: null,
      rosterSoloOwnerOnly: null,
    };
    const snap = mapListCentersRowToSnapshot(row);
    expect(snap.officeIsPublicListed).toBeUndefined();
  });
});
