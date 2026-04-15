import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import type { ReportPermissionKey } from "@shared/reportPermissions";

type Props = {
  companyId: number | undefined;
};

const KEYS: { key: ReportPermissionKey; label: string }[] = [
  { key: "view_reports", label: "Reports & export" },
  { key: "view_payroll", label: "Payroll" },
  { key: "view_executive_summary", label: "Executive summary" },
];

function nextPermissions(
  current: string[] | null | undefined,
  key: ReportPermissionKey,
  enabled: boolean,
): ReportPermissionKey[] {
  const allowed = new Set<ReportPermissionKey>(["view_reports", "view_payroll", "view_executive_summary"]);
  const next = new Set(
    (Array.isArray(current) ? current : []).filter((p): p is ReportPermissionKey => allowed.has(p as ReportPermissionKey)),
  );
  if (enabled) next.add(key);
  else next.delete(key);
  return Array.from(next);
}

export function ReportDelegationPanel({ companyId }: Props) {
  const utils = trpc.useUtils();
  const { data: rows, isLoading } = trpc.companies.getReportDelegations.useQuery(
    { companyId: companyId ?? undefined },
    { enabled: companyId != null },
  );

  const setDelegation = trpc.companies.setReportDelegations.useMutation({
    onSuccess: () => {
      toast.success("Permissions updated");
      void utils.companies.getReportDelegations.invalidate();
    },
    onError: (e) => {
      toast.error(e.message);
      void utils.companies.getReportDelegations.invalidate();
    },
  });

  if (companyId == null) {
    return <p className="text-sm text-muted-foreground">Select a company workspace.</p>;
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Role</TableHead>
          {KEYS.map((k) => (
            <TableHead key={k.key} className="text-center w-[140px]">
              {k.label}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {(rows ?? []).map((row) => {
          const perms = Array.isArray(row.permissions) ? row.permissions : [];
          const isAdmin = row.role === "company_admin";
          return (
            <TableRow key={row.memberId}>
              <TableCell className="font-medium">
                {(row.name ?? "").trim() || row.email || `User #${row.userId}`}
              </TableCell>
              <TableCell>
                {isAdmin ? (
                  <Badge variant="secondary">Full access</Badge>
                ) : (
                  <span className="text-muted-foreground text-sm">{row.role}</span>
                )}
              </TableCell>
              {KEYS.map(({ key }) => (
                <TableCell key={key} className="text-center">
                  {isAdmin ? (
                    <span className="text-muted-foreground text-xs">—</span>
                  ) : (
                    <Switch
                      checked={perms.includes(key)}
                      disabled={setDelegation.isPending}
                      onCheckedChange={(checked) => {
                        setDelegation.mutate({
                          companyId,
                          memberId: row.memberId,
                          permissions: nextPermissions(perms, key, checked),
                        });
                      }}
                    />
                  )}
                </TableCell>
              ))}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
