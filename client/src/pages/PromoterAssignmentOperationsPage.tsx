/**
 * Phase 1 — Promoter assignment operations: lifecycle, commercial fields, headcount summary.
 */
import React, { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { ASSIGNMENT_STATUSES, type AssignmentStatus } from "@shared/promoterAssignmentLifecycle";
import { HubBreadcrumb } from "@/components/hub/HubBreadcrumb";
import { Building2, Loader2, Users } from "lucide-react";
import { Link } from "wouter";

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const s = typeof d === "string" ? d : d.toISOString();
  return s.slice(0, 10);
}

function statusBadgeClass(s: string): string {
  switch (s) {
    case "active":
      return "bg-emerald-500/15 text-emerald-700 border-emerald-500/30";
    case "draft":
      return "bg-slate-500/15 text-slate-700 border-slate-500/30";
    case "suspended":
      return "bg-amber-500/15 text-amber-800 border-amber-500/30";
    case "completed":
      return "bg-blue-500/15 text-blue-800 border-blue-500/30";
    case "terminated":
      return "bg-red-500/15 text-red-800 border-red-500/30";
    default:
      return "bg-muted text-muted-foreground";
  }
}

type ListRow = {
  id: string;
  assignmentStatus: string;
  firstPartyName: string;
  secondPartyName?: string;
  siteName: string | null;
  promoterName: string;
  billingModel: string | null;
  billingRate: string | null;
  currencyCode: string;
  startDate: Date | string;
  endDate: Date | string | null;
  supervisorLabel: string | null;
};

export default function PromoterAssignmentOperationsPage() {
  const { activeCompanyId } = useActiveCompany();
  const companyId = activeCompanyId ?? undefined;

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [siteFilter, setSiteFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const utils = trpc.useUtils();

  const { data: summary, isLoading: summaryLoading } = trpc.promoterAssignments.summary.useQuery(
    { companyId },
    { enabled: !!companyId },
  );

  const { data: rows = [], isLoading: listLoading } = trpc.promoterAssignments.list.useQuery(
    {
      companyId,
      assignmentStatus:
        statusFilter !== "all" ? (statusFilter as AssignmentStatus) : undefined,
      firstPartyCompanyId: brandFilter !== "all" ? Number(brandFilter) : undefined,
      clientSiteId: siteFilter !== "all" ? Number(siteFilter) : undefined,
      search: search.trim() || undefined,
    },
    { enabled: !!companyId },
  );

  const transition = trpc.promoterAssignments.transitionAssignmentStatus.useMutation({
    onSuccess: async () => {
      toast.success("Status updated");
      await utils.promoterAssignments.list.invalidate();
      await utils.promoterAssignments.summary.invalidate();
      setPendingTransition(null);
      setSuspendReason("");
      setTerminateReason("");
    },
    onError: (e) => toast.error(e.message),
  });

  const [detail, setDetail] = useState<ListRow | null>(null);
  const [pendingTransition, setPendingTransition] = useState<{
    id: string;
    to: AssignmentStatus;
    label: string;
  } | null>(null);
  const [suspendReason, setSuspendReason] = useState("");
  const [terminateReason, setTerminateReason] = useState("");
  const [endDateInput, setEndDateInput] = useState("");

  const brandOptions = useMemo(() => summary?.activeHeadcountByBrand ?? [], [summary]);
  const siteOptions = useMemo(() => summary?.activeHeadcountBySite ?? [], [summary]);

  const kpi = summary?.byStatus;

  return (
    <div className="container max-w-7xl py-8 space-y-6">
      <HubBreadcrumb
        items={[
          { label: "HR", href: "/hr/employees" },
          { label: "Promoter assignments (operations)" },
        ]}
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Users className="h-7 w-7 text-primary" />
            Promoter assignment operations
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Lifecycle, rates, and headcount by brand and site. Agreements are still managed under{" "}
            <Link href="/hr/contracts" className="text-primary underline">
              Promoter agreements
            </Link>
            .
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {(
          [
            ["total", summary?.total ?? 0, "Total"],
            ["draft", kpi?.draft ?? 0, "Draft"],
            ["active", kpi?.active ?? 0, "Active"],
            ["suspended", kpi?.suspended ?? 0, "Suspended"],
            ["completed", kpi?.completed ?? 0, "Completed"],
            ["terminated", kpi?.terminated ?? 0, "Terminated"],
          ] as const
        ).map(([key, n, label]) => (
          <Card key={key}>
            <CardHeader className="py-3 pb-1">
              <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 pb-3">
              <div className="text-2xl font-semibold tabular-nums">
                {summaryLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : n}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Building2 className="h-4 w-4" /> Active headcount by brand (client)
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            {brandOptions.length === 0 && !summaryLoading ? (
              <p className="text-muted-foreground">No active assignments.</p>
            ) : (
              brandOptions.map((b) => (
                <div key={b.firstPartyCompanyId} className="flex justify-between gap-2">
                  <span className="truncate">{b.brandName}</span>
                  <span className="font-medium tabular-nums">{b.count}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Active headcount by site</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            {siteOptions.length === 0 && !summaryLoading ? (
              <p className="text-muted-foreground">No active site-linked assignments.</p>
            ) : (
              siteOptions.map((s, i) => (
                <div key={`${s.clientSiteId ?? "none"}-${i}`} className="flex justify-between gap-2">
                  <span className="truncate">{s.siteName ?? `Site #${s.clientSiteId ?? "—"}`}</span>
                  <span className="font-medium tabular-nums">{s.count}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Assignments</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col lg:flex-row gap-3 flex-wrap">
            <Input
              placeholder="Search promoter or company…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {ASSIGNMENT_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={brandFilter} onValueChange={setBrandFilter}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Brand" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All brands</SelectItem>
                {brandOptions.map((b) => (
                  <SelectItem key={b.firstPartyCompanyId} value={String(b.firstPartyCompanyId)}>
                    {b.brandName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={siteFilter} onValueChange={setSiteFilter}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Site" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sites</SelectItem>
                {siteOptions.map((s, i) => (
                  <SelectItem
                    key={`${s.clientSiteId ?? "x"}-${i}`}
                    value={s.clientSiteId != null ? String(s.clientSiteId) : "none"}
                    disabled={s.clientSiteId == null}
                  >
                    {s.siteName ?? `Site #${s.clientSiteId}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Promoter</TableHead>
                  <TableHead>Brand</TableHead>
                  <TableHead>Site</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Rate</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>End</TableHead>
                  <TableHead className="w-[100px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {listLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin inline" />
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-muted-foreground text-center py-8">
                      No assignments match your filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  (rows as ListRow[]).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.promoterName}</TableCell>
                      <TableCell>{r.firstPartyName}</TableCell>
                      <TableCell>{r.siteName ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusBadgeClass(r.assignmentStatus)}>
                          {r.assignmentStatus}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm tabular-nums">
                        {r.billingModel && r.billingRate != null
                          ? `${r.billingRate} ${r.currencyCode} / ${r.billingModel.replace("_", " ")}`
                          : "—"}
                      </TableCell>
                      <TableCell className="text-sm">{fmtDate(r.startDate)}</TableCell>
                      <TableCell className="text-sm">{fmtDate(r.endDate)}</TableCell>
                      <TableCell>
                        <Button variant="outline" size="sm" onClick={() => setDetail(r)}>
                          Manage
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={detail !== null} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Assignment</DialogTitle>
            <DialogDescription>
              {detail?.promoterName} · {detail?.firstPartyName}
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-muted-foreground text-xs">Status</div>
                  <Badge className={statusBadgeClass(detail.assignmentStatus)} variant="outline">
                    {detail.assignmentStatus}
                  </Badge>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">Employer</div>
                  <div>{detail.secondPartyName}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">Start</div>
                  {fmtDate(detail.startDate)}
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">End</div>
                  {fmtDate(detail.endDate)}
                </div>
              </div>
              {detail.supervisorLabel && (
                <div>
                  <div className="text-muted-foreground text-xs">Supervisor</div>
                  {detail.supervisorLabel}
                </div>
              )}
              <div className="flex flex-wrap gap-2 pt-2">
                {detail.assignmentStatus === "draft" && (
                  <>
                    <Button
                      size="sm"
                      onClick={() =>
                        setPendingTransition({ id: detail.id, to: "active", label: "Activate" })
                      }
                    >
                      Activate
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() =>
                        setPendingTransition({ id: detail.id, to: "terminated", label: "Terminate" })
                      }
                    >
                      Terminate
                    </Button>
                  </>
                )}
                {detail.assignmentStatus === "active" && (
                  <>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        setPendingTransition({ id: detail.id, to: "suspended", label: "Suspend" })
                      }
                    >
                      Suspend
                    </Button>
                    <Button
                      size="sm"
                      onClick={() =>
                        setPendingTransition({ id: detail.id, to: "completed", label: "Complete" })
                      }
                    >
                      Complete
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() =>
                        setPendingTransition({ id: detail.id, to: "terminated", label: "Terminate" })
                      }
                    >
                      Terminate
                    </Button>
                  </>
                )}
                {detail.assignmentStatus === "suspended" && (
                  <>
                    <Button
                      size="sm"
                      onClick={() =>
                        setPendingTransition({ id: detail.id, to: "active", label: "Reactivate" })
                      }
                    >
                      Reactivate
                    </Button>
                    <Button
                      size="sm"
                      onClick={() =>
                        setPendingTransition({ id: detail.id, to: "completed", label: "Complete" })
                      }
                    >
                      Complete
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() =>
                        setPendingTransition({ id: detail.id, to: "terminated", label: "Terminate" })
                      }
                    >
                      Terminate
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDetail(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={pendingTransition !== null}
        onOpenChange={(o) => !o && setPendingTransition(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pendingTransition?.label}</AlertDialogTitle>
            <AlertDialogDescription>
              Confirm this lifecycle change for the assignment. Terminal moves require an end date and reasons where
              applicable.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {(pendingTransition?.to === "completed" || pendingTransition?.to === "terminated") && (
            <div className="space-y-2 py-2">
              <Label>End date</Label>
              <Input type="date" value={endDateInput} onChange={(e) => setEndDateInput(e.target.value)} />
            </div>
          )}
          {pendingTransition?.to === "suspended" && (
            <div className="space-y-2 py-2">
              <Label>Reason</Label>
              <Textarea value={suspendReason} onChange={(e) => setSuspendReason(e.target.value)} rows={3} />
            </div>
          )}
          {pendingTransition?.to === "terminated" && (
            <div className="space-y-2 py-2">
              <Label>Termination reason</Label>
              <Textarea value={terminateReason} onChange={(e) => setTerminateReason(e.target.value)} rows={3} />
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (!pendingTransition || !companyId) return;
                const to = pendingTransition.to;
                transition.mutate({
                  companyId,
                  id: pendingTransition.id,
                  to,
                  endDate:
                    to === "completed" || to === "terminated"
                      ? endDateInput || undefined
                      : undefined,
                  suspensionReason: to === "suspended" ? suspendReason : undefined,
                  terminationReason: to === "terminated" ? terminateReason : undefined,
                });
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
