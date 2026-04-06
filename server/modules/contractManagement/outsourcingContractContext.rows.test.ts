import { describe, it, expect } from "vitest";
import { buildOutsourcingContractDocumentContextFromRows } from "./outsourcingContractContext";

describe("buildOutsourcingContractDocumentContextFromRows", () => {
  const baseBundle = {
    contract: {
      effectiveDate: new Date("2026-01-15"),
      expiryDate: new Date("2026-12-31"),
      contractNumber: "PA-1001",
      issueDate: new Date("2026-01-10"),
    },
    firstPartyRow: {
      displayNameEn: "Client Co LLC",
      displayNameAr: "شركة العميل",
      registrationNumber: "CR123",
      companyId: 10 as number | null,
      partyId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    },
    secondPartyRow: {
      displayNameEn: "Employer Co",
      displayNameAr: "الشركة المشغلة",
      registrationNumber: "CR456",
      companyId: 20 as number | null,
      partyId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    },
    locationRow: { locationEn: "Muscat HQ", locationAr: "مسقط" },
    promoterDetail: {
      fullNameEn: "Ali Ahmed",
      fullNameAr: "علي أحمد",
      civilId: "12345678",
      passportNumber: "AB123456",
      passportExpiry: new Date("2028-06-01"),
      nationality: "Omani",
      jobTitleEn: "Promoter",
    },
  };

  it("builds context for platform-linked first party (tenant client)", () => {
    const ctx = buildOutsourcingContractDocumentContextFromRows(baseBundle);
    expect(ctx.first_party.company_name_en).toBe("Client Co LLC");
    expect(ctx.first_party.cr_number).toBe("CR123");
    expect(ctx.second_party.cr_number).toBe("CR456");
    expect(ctx.assignment.contract_reference_number).toBe("PA-1001");
  });

  it("supports external managed first party (no platform company on snapshot)", () => {
    const ctx = buildOutsourcingContractDocumentContextFromRows({
      ...baseBundle,
      firstPartyRow: {
        ...baseBundle.firstPartyRow,
        companyId: null,
        partyId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
        registrationNumber: null,
      },
    });
    expect(ctx.first_party.company_name_en).toBe("Client Co LLC");
    expect(ctx.first_party.cr_number).toBe("—");
  });

  it("matches linked-external shape when snapshot carries company_id after platform link", () => {
    const ctx = buildOutsourcingContractDocumentContextFromRows({
      ...baseBundle,
      firstPartyRow: {
        ...baseBundle.firstPartyRow,
        companyId: 99,
        registrationNumber: "CR-ALIGNED",
      },
    });
    expect(ctx.first_party.cr_number).toBe("CR-ALIGNED");
  });
});
