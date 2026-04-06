/**
 * Shared access rules for outsourcing contracts (list/detail/mutations).
 * Kept separate from the tRPC router for unit testing.
 */

/** True if the active tenant company is involved: header anchor, any party snapshot with company_id, or promoter employer. */
export function activeCompanyInvolvedInContract(
  activeId: number,
  contract: { companyId: number | null },
  parties: { companyId: number | null }[],
  promoterEmployerCompanyId: number | null | undefined
): boolean {
  const ids = new Set<number>();
  if (contract.companyId != null) ids.add(contract.companyId);
  for (const p of parties) {
    if (p.companyId != null) ids.add(p.companyId);
  }
  if (promoterEmployerCompanyId != null) ids.add(promoterEmployerCompanyId);
  return ids.has(activeId);
}
