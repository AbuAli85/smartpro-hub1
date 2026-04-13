import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  ArrowLeft,
  ClipboardList,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Search,
  RefreshCw,
  Clock,
  Link2,
  Info,
  Tags,
} from "lucide-react";
import { fmtDateTime } from "@/lib/dateUtils";
import {
  formatProfileRequestAge,
  previewProfileRequestValue,
} from "@shared/profileChangeRequestDeepLink";
import {
  PROFILE_REQUEST_AGE_BUCKET_OPTIONS,
  type ProfileRequestAgeBucket,
} from "@shared/profileChangeRequestQueueFilters";
import {
  isProfileFieldKey,
  PROFILE_FIELD_KEY_FILTER_OPTIONS,
  PROFILE_FIELD_KEY_LABELS,
  PROFILE_FIELD_KEYS,
  type ProfileFieldKey,
  type ProfileFieldKeyFilterValue,
} from "@shared/profileChangeRequestFieldKey";
import {
  defaultReclassifyTargetKey,
  reclassifyFieldKeyIsNoOp,
} from "@shared/profileChangeRequestReclassification";
import {
  DEFAULT_PROFILE_CHANGE_QUEUE_STATE,
  parseProfileChangeQueueSearch,
  PROFILE_CHANGE_QUEUE_PATH,
  serializeProfileChangeQueueState,
  type ProfileChangeQueueState,
} from "@shared/profileChangeRequestQueueUrl";
import {
  oldestPendingAgeHours,
  pickTopPendingFieldKey,
} from "@shared/profileChangeRequestQueueKpis";

type Row = {
  id: number;
  employeeId: number;
  fieldLabel: string;
  fieldKey: string;
  requestedValue: string;
  notes: string | null;
  status: "pending" | "resolved" | "rejected";
  submittedAt: Date | string | null;
  submitterName: string | null;
  submitterEmail: string | null;
  employeeFirstName: string | null;
  employeeLastName: string | null;
};

function statusBadgeProps(status: Row["status"]) {
  if (status === "pending") {
    return {
      variant: "default" as const,
      className: "text-xs capitalize shadow-none",
    };
  }
  if (status === "resolved") {
    return {
      variant: "outline" as const,
      className:
        "text-xs capitalize border-emerald-300 bg-emerald-50/60 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100",
    };
  }
  return {
    variant: "outline" as const,
    className: "text-xs capitalize border-border text-muted-foreground",
  };
}

export default function WorkforceProfileChangeRequestsPage() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const searchRef = useRef(search);
  searchRef.current = search;

  const { activeCompanyId } = useActiveCompany();
  const filters = useMemo(() => parseProfileChangeQueueSearch(search), [search]);

  const [queryInput, setQueryInput] = useState(() => parseProfileChangeQueueSearch(search).query);
  useEffect(() => {
    setQueryInput(parseProfileChangeQueueSearch(search).query);
  }, [search]);

  const pushState = useCallback((patch: Partial<ProfileChangeQueueState>) => {
    const base = parseProfileChangeQueueSearch(searchRef.current);
    const next = { ...base, ...patch };
    const qs = serializeProfileChangeQueueState(next);
    setLocation(qs ? `${PROFILE_CHANGE_QUEUE_PATH}?${qs}` : PROFILE_CHANGE_QUEUE_PATH, { replace: true });
  }, [setLocation]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      const current = parseProfileChangeQueueSearch(searchRef.current);
      if (current.query === queryInput.trim()) return;
      pushState({ query: queryInput, page: 1 });
    }, 350);
    return () => window.clearTimeout(t);
  }, [queryInput, pushState]);

  const queryForApi = queryInput.trim();
  const pageSize = 25;

  const hasActiveFilters = useMemo(() => {
    const d = DEFAULT_PROFILE_CHANGE_QUEUE_STATE;
    return (
      queryForApi.length > 0 ||
      filters.status !== d.status ||
      filters.fieldKey !== d.fieldKey ||
      filters.ageBucket !== d.ageBucket ||
      filters.page !== d.page
    );
  }, [filters.status, filters.fieldKey, filters.ageBucket, filters.page, queryForApi]);

  const resetFilters = () => {
    setQueryInput("");
    setLocation(PROFILE_CHANGE_QUEUE_PATH, { replace: true });
  };

  const { data, isLoading, refetch } = trpc.workforce.profileChangeRequests.listCompany.useQuery(
    {
      companyId: activeCompanyId ?? undefined,
      status: filters.status,
      query: queryForApi || undefined,
      ageBucket: filters.ageBucket,
      fieldKey: filters.fieldKey,
      page: filters.page,
      pageSize,
    },
    { enabled: activeCompanyId != null },
  );

  const { data: queueKpis } = trpc.workforce.profileChangeRequests.queueKpis.useQuery(undefined, {
    enabled: activeCompanyId != null,
    staleTime: 30_000,
  });

  const topPending = useMemo(
    () => pickTopPendingFieldKey(queueKpis?.pendingByFieldKey ?? []),
    [queueKpis?.pendingByFieldKey],
  );
  const oldestHours = oldestPendingAgeHours(queueKpis?.oldestPendingSubmittedAt ?? null);

  const utils = trpc.useUtils();
  const invalidateQueue = useCallback(() => {
    void utils.workforce.profileChangeRequests.listCompany.invalidate();
    void utils.workforce.profileChangeRequests.queueKpis.invalidate();
  }, [utils]);

  const invalidateAfterReclassify = useCallback(
    (employeeId: number) => {
      void utils.workforce.profileChangeRequests.listCompany.invalidate();
      void utils.workforce.profileChangeRequests.queueKpis.invalidate();
      void utils.workforce.profileChangeRequests.listForEmployee.invalidate({ employeeId });
      void utils.employeePortal.getMyProfileChangeRequests.invalidate();
    },
    [utils],
  );

  const [dialog, setDialog] = useState<{
    open: boolean;
    mode: "resolve" | "reject";
    row: Row | null;
  }>({ open: false, mode: "resolve", row: null });
  const [actionNote, setActionNote] = useState("");

  const [reclassifyDialog, setReclassifyDialog] = useState<{
    open: boolean;
    row: Row | null;
    newKey: ProfileFieldKey;
  }>({ open: false, row: null, newKey: "legal_name" });

  const resolveReq = trpc.workforce.profileChangeRequests.resolve.useMutation({
    onSuccess: () => {
      toast.success("Marked as resolved");
      invalidateQueue();
      setDialog({ open: false, mode: "resolve", row: null });
      setActionNote("");
    },
    onError: (e) => toast.error(e.message),
  });
  const rejectReq = trpc.workforce.profileChangeRequests.reject.useMutation({
    onSuccess: () => {
      toast.success("Request closed");
      invalidateQueue();
      setDialog({ open: false, mode: "resolve", row: null });
      setActionNote("");
    },
    onError: (e) => toast.error(e.message),
  });

  const reclassifyReq = trpc.workforce.profileChangeRequests.reclassifyFieldKey.useMutation({
    onError: (e) => toast.error(e.message),
  });

  const items = (data?.items ?? []) as Row[];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = filters.page;

  const copyFilterLink = () => {
    const path = `${window.location.origin}${window.location.pathname}${window.location.search}`;
    void navigator.clipboard.writeText(path).then(
      () => toast.success("Link copied"),
      () => toast.error("Could not copy"),
    );
  };

  const showOtherInsight =
    (queueKpis?.pendingOther ?? 0) > 0 &&
    filters.status === "pending" &&
    filters.fieldKey !== "other";

  return (
    <div className="p-6 space-y-5 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setLocation("/workforce")} className="gap-1">
            <ArrowLeft className="h-4 w-4" />
            Workforce
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ClipboardList className="h-7 w-7 text-primary" />
              Profile change requests
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Company queue — open an employee to edit records, then resolve here. Filters sync to the URL for
              sharing.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={copyFilterLink} title="Copy link with current filters">
            <Link2 className="h-4 w-4 mr-2" />
            Copy link
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {queueKpis != null && queueKpis.pendingTotal > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="shadow-sm border-border/80">
            <CardContent className="pt-4 pb-3 px-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Pending total</p>
              <p className="text-2xl font-bold tabular-nums">{queueKpis.pendingTotal}</p>
            </CardContent>
          </Card>
          <Card className="shadow-sm border-border/80">
            <CardContent className="pt-4 pb-3 px-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Uncategorized</p>
              <p className="text-2xl font-bold tabular-nums">{queueKpis.pendingOther}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">fieldKey &quot;other&quot;</p>
            </CardContent>
          </Card>
          <Card className="shadow-sm border-border/80">
            <CardContent className="pt-4 pb-3 px-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Top category</p>
              <p className="text-sm font-semibold leading-tight truncate" title={topPending.label ?? ""}>
                {topPending.label ?? "—"}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{topPending.count} open</p>
            </CardContent>
          </Card>
          <Card className="shadow-sm border-border/80">
            <CardContent className="pt-4 pb-3 px-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Oldest pending</p>
              <p className="text-2xl font-bold tabular-nums">
                {oldestHours == null ? "—" : oldestHours < 48 ? `${oldestHours}h` : `${Math.floor(oldestHours / 24)}d`}
              </p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {showOtherInsight ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/90 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950/40">
          <Info className="h-4 w-4 text-slate-600 dark:text-slate-400 shrink-0" />
          <span className="text-slate-800 dark:text-slate-200">
            {queueKpis!.pendingOther} pending request{queueKpis!.pendingOther === 1 ? "" : "s"} use the &quot;Other /
            custom&quot; category (display labels did not match a standard field).
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs ml-auto"
            onClick={() => pushState({ fieldKey: "other", status: "pending", page: 1 })}
          >
            View other
          </Button>
        </div>
      ) : null}

      <Card>
        <CardHeader className="pb-3 flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Filters</CardTitle>
          {hasActiveFilters ? (
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={resetFilters}>
              Reset filters
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3 items-end">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Employee name, field, or value…"
              value={queryInput}
              onChange={(e) => {
                setQueryInput(e.target.value);
              }}
            />
          </div>
          <Select
            value={filters.status}
            onValueChange={(v) => {
              pushState({ status: v as ProfileChangeQueueState["status"], page: 1 });
            }}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="rejected">Closed / rejected</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={filters.ageBucket}
            onValueChange={(v) => {
              pushState({ ageBucket: v as ProfileRequestAgeBucket, page: 1 });
            }}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Age" />
            </SelectTrigger>
            <SelectContent>
              {PROFILE_REQUEST_AGE_BUCKET_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filters.fieldKey}
            onValueChange={(v) => {
              pushState({ fieldKey: v as ProfileFieldKeyFilterValue, page: 1 });
            }}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Field type" />
            </SelectTrigger>
            <SelectContent>
              {PROFILE_FIELD_KEY_FILTER_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : items.length === 0 ? (
            <div className="p-10 text-center space-y-3 max-w-lg mx-auto">
              <ClipboardList className="h-10 w-10 mx-auto text-muted-foreground/40" />
              <p className="text-sm font-medium text-foreground">
                {hasActiveFilters ? "No matching requests" : "No profile change requests yet"}
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {filters.fieldKey === "other"
                  ? "“Other / custom” means the employee’s label did not match a standard category. Review the Field column; use “Set category” on a pending row to correct the classification without changing the label text."
                  : hasActiveFilters
                    ? "Try clearing search, changing status, or widening the age filter."
                    : "When employees submit updates from Employee home, they will appear here for HR review."}
              </p>
              {hasActiveFilters ? (
                <Button variant="outline" size="sm" onClick={resetFilters}>
                  Reset filters
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/90 dark:bg-muted/50 text-left sticky top-0 z-10 backdrop-blur supports-[backdrop-filter]:bg-muted/75">
                    <th className="px-4 py-3 font-medium">Employee</th>
                    <th className="px-4 py-3 font-medium">Field</th>
                    <th className="px-4 py-3 font-medium max-w-[220px]">Requested value</th>
                    <th className="px-4 py-3 font-medium">Submitted</th>
                    <th className="px-4 py-3 font-medium">Age</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((r) => {
                    const name =
                      [r.employeeFirstName, r.employeeLastName].filter(Boolean).join(" ") || `ID ${r.employeeId}`;
                    const pending = r.status === "pending";
                    const sb = statusBadgeProps(r.status);
                    const valuePreview = previewProfileRequestValue(r.requestedValue, 96);
                    const keyLabel = isProfileFieldKey(r.fieldKey) ? PROFILE_FIELD_KEY_LABELS[r.fieldKey] : null;
                    return (
                      <tr
                        key={r.id}
                        className={
                          pending
                            ? "border-b bg-amber-50/40 dark:bg-amber-950/15"
                            : "border-b hover:bg-muted/30"
                        }
                      >
                        <td className="px-4 py-3 font-medium align-top">{name}</td>
                        <td className="px-4 py-3 align-top">
                          <span className="font-medium text-foreground">{r.fieldLabel}</span>
                          {keyLabel ? (
                            <p className="text-[11px] text-muted-foreground mt-0.5">{keyLabel}</p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 max-w-[240px] align-top">
                          <p className="line-clamp-2 break-words text-left" title={r.requestedValue}>
                            {valuePreview}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap align-top">
                          {r.submittedAt ? fmtDateTime(r.submittedAt) : "—"}
                          <div className="text-[11px]">
                            {r.submitterName || r.submitterEmail || "—"}
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            <Clock className="h-3.5 w-3.5 shrink-0" />
                            {formatProfileRequestAge(r.submittedAt)}
                          </span>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <Badge variant={sb.variant} className={sb.className}>
                            {r.status === "rejected" ? "Closed" : r.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right align-top">
                          <div className="flex flex-col gap-1.5 items-stretch sm:flex-row sm:justify-end sm:items-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 text-xs justify-center sm:justify-end"
                              onClick={() =>
                                setLocation(`/workforce/employees/${r.employeeId}?profileRequest=${r.id}`)
                              }
                            >
                              <ExternalLink className="h-3.5 w-3.5 mr-1 shrink-0" />
                              Open employee
                            </Button>
                            {pending ? (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 text-xs justify-center"
                                  onClick={() =>
                                    setReclassifyDialog({
                                      open: true,
                                      row: r,
                                      newKey: defaultReclassifyTargetKey(r.fieldKey),
                                    })
                                  }
                                >
                                  <Tags className="h-3.5 w-3.5 mr-1 shrink-0" />
                                  Set category
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 text-xs justify-center"
                                  onClick={() => {
                                    setActionNote("");
                                    setDialog({ open: true, mode: "resolve", row: r });
                                  }}
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5 mr-1 shrink-0" />
                                  Resolve
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 text-xs justify-center text-muted-foreground"
                                  onClick={() => {
                                    setActionNote("");
                                    setDialog({ open: true, mode: "reject", row: r });
                                  }}
                                >
                                  <XCircle className="h-3.5 w-3.5 mr-1 shrink-0" />
                                  Close
                                </Button>
                              </>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {totalPages > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3 text-sm text-muted-foreground">
              <span>
                Page {page} of {totalPages} · {total} total
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => pushState({ page: Math.max(1, page - 1) })}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => pushState({ page: Math.min(totalPages, page + 1) })}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={dialog.open}
        onOpenChange={(open) => {
          if (!open) setDialog({ open: false, mode: "resolve", row: null });
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {dialog.mode === "resolve" ? "Mark resolved" : "Close request"}
            </DialogTitle>
            <DialogDescription>
              {dialog.row ? (
                <>
                  <span className="font-medium text-foreground">{dialog.row.fieldLabel}</span>
                  {" — "}
                  {previewProfileRequestValue(dialog.row.requestedValue, 120)}
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label className="text-xs">Note for audit trail (optional)</Label>
            <Textarea
              value={actionNote}
              onChange={(e) => setActionNote(e.target.value)}
              rows={3}
              maxLength={500}
              className="text-sm resize-none"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDialog({ open: false, mode: "resolve", row: null })}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!dialog.row || resolveReq.isPending || rejectReq.isPending}
              onClick={() => {
                const id = dialog.row?.id;
                if (!id) return;
                const note = actionNote.trim() || undefined;
                if (dialog.mode === "resolve") {
                  resolveReq.mutate({ requestId: id, resolutionNote: note });
                } else {
                  rejectReq.mutate({ requestId: id, resolutionNote: note });
                }
              }}
            >
              {dialog.mode === "resolve" ? "Mark resolved" : "Close request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={reclassifyDialog.open}
        onOpenChange={(open) => {
          if (!open) setReclassifyDialog({ open: false, row: null, newKey: "legal_name" });
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Set category</DialogTitle>
            <DialogDescription>
              Updates the internal field type only. The employee&apos;s field label below stays unchanged for the
              record.
            </DialogDescription>
          </DialogHeader>
          {reclassifyDialog.row ? (
            <div className="space-y-3 py-1">
              <p className="text-sm">
                <span className="font-medium text-foreground">{reclassifyDialog.row.fieldLabel}</span>
              </p>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Category (fieldKey)</Label>
                <Select
                  value={reclassifyDialog.newKey}
                  onValueChange={(v) =>
                    setReclassifyDialog((d) =>
                      d.row ? { ...d, newKey: v as ProfileFieldKey } : d,
                    )
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {PROFILE_FIELD_KEYS.map((k) => (
                      <SelectItem key={k} value={k}>
                        {PROFILE_FIELD_KEY_LABELS[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setReclassifyDialog({ open: false, row: null, newKey: "legal_name" })}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={
                !reclassifyDialog.row ||
                reclassifyReq.isPending ||
                (reclassifyDialog.row
                  ? reclassifyFieldKeyIsNoOp(reclassifyDialog.row.fieldKey, reclassifyDialog.newKey)
                  : true)
              }
              onClick={() => {
                const row = reclassifyDialog.row;
                if (!row) return;
                reclassifyReq.mutate(
                  { requestId: row.id, newFieldKey: reclassifyDialog.newKey },
                  {
                    onSuccess: () => {
                      toast.success("Category updated");
                      invalidateAfterReclassify(row.employeeId);
                      setReclassifyDialog({ open: false, row: null, newKey: "legal_name" });
                    },
                  },
                );
              }}
            >
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
