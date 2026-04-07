/**
 * RFC 4180-style CSV for owner-resolution exports — stable column order.
 */

import type { OwnerResolutionExportRow, OwnerResolutionSnapshot } from "./ownerResolution";

function csvCell(v: string | number | boolean | null | undefined): string {
  const s = v == null ? "" : String(v);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const EXPORT_COLUMNS: (keyof OwnerResolutionExportRow)[] = [
  "rowKind",
  "workflowScope",
  "reviewBucket",
  "contactId",
  "billingCycleId",
  "displayName",
  "secondaryLabel",
  "tier",
  "rankReason",
  "nextActionLabel",
  "nextActionHref",
  "accountableOwnerLabel",
  "hasOpenEmployeeTask",
  "matchingTaskIds",
  "accountabilityGap",
  "renewalInterventionDueAt",
  "dueOrInterventionDate",
  "taskDueOverdue",
  "reviewBasis",
];

export function buildOwnerResolutionCsv(snapshot: OwnerResolutionSnapshot): string {
  const header = EXPORT_COLUMNS.join(",");
  const lines = [header];
  for (const row of snapshot.exportRows) {
    const cells = EXPORT_COLUMNS.map((k) => csvCell(row[k] as string | number | boolean | null | undefined));
    lines.push(cells.join(","));
  }
  return lines.join("\r\n");
}

export function buildOwnerResolutionExportJson(snapshot: OwnerResolutionSnapshot): string {
  return JSON.stringify(
    {
      exportMeta: snapshot.exportMeta,
      basis: snapshot.basis,
      collectionsWorkspaceNote: snapshot.collectionsWorkspaceNote,
      reviewSummary: snapshot.reviewSummary,
      exportRows: snapshot.exportRows,
    },
    null,
    2,
  );
}
