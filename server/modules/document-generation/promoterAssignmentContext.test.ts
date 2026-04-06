import { describe, expect, it, vi } from "vitest";
import { companies, employees, promoterAssignments } from "../../../drizzle/schema";
import { buildPromoterAssignmentDocumentContext } from "./promoterAssignmentContext";

function mockDb(handlers: {
  assignment?: unknown[];
  companies?: unknown[];
  employees?: unknown[];
}) {
  return {
    select: vi.fn(() => ({
      from: vi.fn((table: object) => {
        if (table === promoterAssignments) {
          return {
            where: vi.fn(() => ({
              limit: vi.fn(() => Promise.resolve(handlers.assignment ?? [])),
            })),
          };
        }
        if (table === companies) {
          return {
            where: vi.fn(() => Promise.resolve(handlers.companies ?? [])),
          };
        }
        if (table === employees) {
          return {
            where: vi.fn(() => ({
              limit: vi.fn(() => Promise.resolve(handlers.employees ?? [])),
            })),
          };
        }
        return {
          where: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve([])),
          })),
        };
      }),
    })),
  } as never;
}

describe("buildPromoterAssignmentDocumentContext", () => {
  const entityId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  const firstCo = {
    id: 1,
    name: "First EN",
    nameAr: "First AR",
    crNumber: "CR1",
    registrationNumber: null,
  };
  const secondCo = {
    id: 2,
    name: "Second EN",
    nameAr: "Second AR",
    crNumber: "CR2",
    registrationNumber: null,
  };
  const employee = {
    id: 10,
    companyId: 2,
    firstName: "John",
    lastName: "Doe",
    firstNameAr: "جون",
    lastNameAr: "دو",
    nationalId: "12345678",
    passportNumber: null,
  };

  const baseAssignment = {
    id: entityId,
    companyId: 1,
    firstPartyCompanyId: 1,
    secondPartyCompanyId: 2,
    promoterEmployeeId: 10,
    locationAr: "مسقط",
    locationEn: "Muscat",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    status: "active",
    contractReferenceNumber: null,
    issueDate: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it("returns normalized context when tenant matches assignment company", async () => {
    const db = mockDb({
      assignment: [baseAssignment],
      companies: [firstCo, secondCo],
      employees: [employee],
    });

    const ctx = await buildPromoterAssignmentDocumentContext(db, entityId, 1, {
      id: 99,
      role: "user",
      platformRole: "company_member",
    });

    expect(ctx.first_party.company_name_en).toBe("First EN");
    expect(ctx.second_party.cr_number).toBe("CR2");
    expect(ctx.promoter.id_card_number).toBe("12345678");
    expect(ctx.assignment.start_date).toBe("2026-01-01");
  });

  it("throws FORBIDDEN when assignment belongs to another company", async () => {
    const db = mockDb({
      assignment: [{ ...baseAssignment, companyId: 99 }],
      companies: [firstCo, secondCo],
      employees: [employee],
    });

    await expect(
      buildPromoterAssignmentDocumentContext(db, entityId, 1, {
        id: 1,
        platformRole: "company_member",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
