import { useMemo, useState } from "react";
import { useLocation } from "wouter";
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
} from "lucide-react";
import { fmtDateTime } from "@/lib/dateUtils";
import { formatProfileRequestAge } from "@shared/profileChangeRequestDeepLink";

type Row = {
  id: number;
  employeeId: number;
  fieldLabel: string;
  requestedValue: string;
  notes: string | null;
  status: "pending" | "resolved" | "rejected";
  submittedAt: Date | string | null;
  submitterName: string | null;
  submitterEmail: string | null;
  employeeFirstName: string | null;
  employeeLastName: string | null;
};

export default function WorkforceProfileChangeRequestsPage() {
  const [, navigate] = useLocation();
  const { activeCompanyId } = useActiveCompany();
  const [status, setStatus] = useState<"all" | "pending" | "resolved" | "rejected">("pending");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const debouncedQuery = useMemo(() => query.trim(), [query]);

  const { data, isLoading, refetch } = trpc.workforce.profileChangeRequests.listCompany.useQuery(
    {
      companyId: activeCompanyId ?? undefined,
      status,
      query: debouncedQuery || undefined,
      page,
      pageSize,
    },
    { enabled: activeCompanyId != null },
  );

  const utils = trpc.useUtils();
  const resolveReq = trpc.workforce.profileChangeRequests.resolve.useMutation({
    onSuccess: () => {
      toast.success("Marked as resolved");
      void utils.workforce.profileChangeRequests.listCompany.invalidate();
      setDialog({ open: false, mode: "resolve", row: null });
      setActionNote("");
    },
    onError: (e) => toast.error(e.message),
  });
  const rejectReq = trpc.workforce.profileChangeRequests.reject.useMutation({
    onSuccess: () => {
      toast.success("Request closed");
      void utils.workforce.profileChangeRequests.listCompany.invalidate();
      setDialog({ open: false, mode: "resolve", row: null });
      setActionNote("");
    },
    onError: (e) => toast.error(e.message),
  });

  const [dialog, setDialog] = useState<{
    open: boolean;
    mode: "resolve" | "reject";
    row: Row | null;
  }>({ open: false, mode: "resolve", row: null });
  const [actionNote, setActionNote] = useState("");

  const items = (data?.items ?? []) as Row[];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="p-6 space-y-5 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/workforce")} className="gap-1">
            <ArrowLeft className="h-4 w-4" />
            Workforce
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ClipboardList className="h-7 w-7 text-primary" />
              Profile change requests
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Company queue — open an employee to edit records, then resolve here.
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Employee name, field, or value…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v as typeof status);
              setPage(1);
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
            <p className="p-8 text-center text-sm text-muted-foreground">No requests match your filters.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left">
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
                    return (
                      <tr
                        key={r.id}
                        className={
                          pending
                            ? "border-b bg-amber-50/40 dark:bg-amber-950/15"
                            : "border-b hover:bg-muted/30"
                        }
                      >
                        <td className="px-4 py-3 font-medium">{name}</td>
                        <td className="px-4 py-3">{r.fieldLabel}</td>
                        <td className="px-4 py-3 max-w-[220px] truncate" title={r.requestedValue}>
                          {r.requestedValue}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                          {r.submittedAt ? fmtDateTime(r.submittedAt) : "—"}
                          <div className="text-[11px]">
                            {r.submitterName || r.submitterEmail || "—"}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            <Clock className="h-3.5 w-3.5" />
                            {formatProfileRequestAge(r.submittedAt)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            variant={pending ? "default" : "secondary"}
                            className="text-xs capitalize"
                          >
                            {r.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs"
                            onClick={() =>
                              navigate(`/workforce/employees/${r.employeeId}?profileRequest=${r.id}`)
                            }
                          >
                            <ExternalLink className="h-3.5 w-3.5 mr-1" />
                            Open
                          </Button>
                          {pending && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs ml-1"
                                onClick={() => {
                                  setActionNote("");
                                  setDialog({ open: true, mode: "resolve", row: r });
                                }}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                                Resolve
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 text-xs ml-1 text-muted-foreground"
                                onClick={() => {
                                  setActionNote("");
                                  setDialog({ open: true, mode: "reject", row: r });
                                }}
                              >
                                <XCircle className="h-3.5 w-3.5 mr-1" />
                                Close
                              </Button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
              <span>
                Page {page} of {totalPages} · {total} total
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
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
                  {dialog.row.requestedValue.slice(0, 120)}
                  {dialog.row.requestedValue.length > 120 ? "…" : ""}
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
    </div>
  );
}
