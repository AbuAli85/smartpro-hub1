/**
 * Shared types for the agreement / party foundation (tRPC + UI).
 */

export type PromoterFlowClientKind = "platform" | "external_party";

/** One row from contractManagement.promoterFlowClientOptions */
export type PromoterFlowClientOptionDto =
  | {
      kind: "platform";
      companyId: number;
      displayNameEn: string;
      displayNameAr: string | null;
      registrationNumber: string | null;
    }
  | {
      kind: "external_party";
      partyId: string;
      displayNameEn: string;
      displayNameAr: string | null;
      registrationNumber: string | null;
    };

/** Who the create form optimizes for — drives defaults and RBAC anchor. */
export type ContractCreationPerspective = "client" | "employer";
