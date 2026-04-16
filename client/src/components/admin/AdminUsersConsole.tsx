import { trpc } from "@/lib/trpc";
import { fmtDateTime } from "@/lib/dateUtils";
import { useState, useMemo, useEffect } from "react";
import {
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Shield,
  Building2,
  KeyRound,
  AlertTriangle,
  CheckCircle2,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { toast } from "sonner";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
type IdentityHealthLevel = "healthy" | "info" | "warning" | "critical";

const PAGE_SIZE = 25;

const GLOBAL_PLATFORM_FILTER = [
  "super_admin",
  "platform_admin",
  "regional_manager",
  "client_services",
  "sanad_network_admin",
  "sanad_compliance_reviewer",
] as const;

const MEMBERSHIP_ROLE_FILTER = [
  "company_admin",
  "hr_admin",
  "finance_admin",
  "company_member",
  "reviewer",
  "client",
  "external_auditor",
] as const;

function healthBadgeClass(level: IdentityHealthLevel): string {
  switch (level) {
    case "critical":
      return "bg-red-100 text-red-900 border-red-200 dark:bg-red-950/40 dark:text-red-200";
    case "warning":
      return "bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-950/40 dark:text-amber-100";
    case "info":
      return "bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-800 dark:text-slate-200";
    default:
      return "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-200";
  }
}

export function AdminUsersConsole() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [accountStatus, setAccountStatus] = useState<string>("any");
  const [globalPlatformRole, setGlobalPlatformRole] = useState<string>("any");
  const [membershipRole, setMembershipRole] = useState<string>("any");
  const [authProvider, setAuthProvider] = useState("");
  const [twoFactor, setTwoFactor] = useState<string>("any");
  const [identityQuick, setIdentityQuick] = useState<string>("any");
  const [securityQuick, setSecurityQuick] = useState<string>("any");
  const [createdAfter, setCreatedAfter] = useState<string>("");
  const [createdBefore, setCreatedBefore] = useState<string>("");
  const [staleDays, setStaleDays] = useState<string>("");
  const [page, setPage] = useState(0);
  const [detailUserId, setDetailUserId] = useState<number | null>(null);

  const offset = page * PAGE_SIZE;

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const listInput = useMemo(() => {
    const staleN = staleDays.trim() === "" ? undefined : Number.parseInt(staleDays, 10);
    return {
      search: debouncedSearch.trim() || undefined,
      accountStatuses:
        accountStatus === "any" ? undefined : ([accountStatus] as ("active" | "invited" | "suspended" | "merged" | "archived")[]),
      globalPlatformRole: globalPlatformRole === "any" ? undefined : globalPlatformRole,
      membershipRole: membershipRole === "any" ? undefined : membershipRole,
      authProvider: authProvider.trim() || undefined,
      twoFactor: twoFactor === "any" ? "any" : (twoFactor as "enabled" | "missing"),
      identityQuickFilter:
        identityQuick === "any" ? "any" : (identityQuick as "duplicate" | "no_memberships" | "merged_inactive" | "privileged_no_2fa"),
      securityQuickFilter: securityQuick === "any" ? "any" : "needs_attention",
      createdAfter: createdAfter ? new Date(`${createdAfter}T00:00:00`) : undefined,
      createdBefore: createdBefore ? new Date(`${createdBefore}T23:59:59.999`) : undefined,
      staleAfterDays: staleN !== undefined && !Number.isNaN(staleN) && staleN >= 0 ? staleN : undefined,
      limit: PAGE_SIZE,
      offset,
    };
  }, [
    debouncedSearch,
    accountStatus,
    globalPlatformRole,
    membershipRole,
    authProvider,
    twoFactor,
    identityQuick,
    securityQuick,
    createdAfter,
    createdBefore,
    staleDays,
    offset,
  ]);

  const utils = trpc.useUtils();

  const { data: listData, isLoading, isFetching, refetch } = trpc.platformOps.adminUsersList.useQuery(listInput, {
    refetchOnWindowFocus: false,
  });

  const { data: detail, isLoading: detailLoading } = trpc.platformOps.adminUserDetail.useQuery(
    { userId: detailUserId! },
    { enabled: detailUserId != null, refetchOnWindowFocus: false },
  );

  const updateUserRoleMutation = trpc.platformOps.updateUserRole.useMutation({
    onSuccess: () => {
      toast.success("Updated");
      void refetch();
      if (detailUserId) {
        void utils.platformOps.adminUserDetail.invalidate({ userId: detailUserId });
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const total = listData?.total ?? 0;
  const items = listData?.items ?? [];
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const copyText = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Copy failed");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-end">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search name or email…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
          />
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => refetch()} className="gap-1">
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <Card className="border-dashed">
        <CardContent className="py-3 px-4 space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Filters</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-2">
            <Select value={accountStatus} onValueChange={(v) => { setAccountStatus(v); setPage(0); }}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Account status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="invited">Invited</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
                <SelectItem value="merged">Merged</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
            <Select value={globalPlatformRole} onValueChange={(v) => { setGlobalPlatformRole(v); setPage(0); }}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Platform role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any platform role</SelectItem>
                {GLOBAL_PLATFORM_FILTER.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={membershipRole} onValueChange={(v) => { setMembershipRole(v); setPage(0); }}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Workspace role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any membership role</SelectItem>
                {MEMBERSHIP_ROLE_FILTER.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              className="h-9 text-xs"
              placeholder="Auth provider contains…"
              value={authProvider}
              onChange={(e) => { setAuthProvider(e.target.value); setPage(0); }}
            />
            <Select value={twoFactor} onValueChange={(v) => { setTwoFactor(v); setPage(0); }}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">2FA any</SelectItem>
                <SelectItem value="enabled">2FA enabled</SelectItem>
                <SelectItem value="missing">2FA missing</SelectItem>
              </SelectContent>
            </Select>
            <Select value={identityQuick} onValueChange={(v) => { setIdentityQuick(v); setPage(0); }}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Identity: any</SelectItem>
                <SelectItem value="duplicate">Duplicate email</SelectItem>
                <SelectItem value="no_memberships">No memberships</SelectItem>
                <SelectItem value="merged_inactive">Merged / inactive</SelectItem>
                <SelectItem value="privileged_no_2fa">Privileged no 2FA</SelectItem>
              </SelectContent>
            </Select>
            <Select value={securityQuick} onValueChange={(v) => { setSecurityQuick(v); setPage(0); }}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Security: any</SelectItem>
                <SelectItem value="needs_attention">Security needs attention</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 pt-2 border-t border-dashed">
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Created after</label>
              <Input
                type="date"
                className="h-9 text-xs"
                value={createdAfter}
                onChange={(e) => {
                  setCreatedAfter(e.target.value);
                  setPage(0);
                }}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Created before</label>
              <Input
                type="date"
                className="h-9 text-xs"
                value={createdBefore}
                onChange={(e) => {
                  setCreatedBefore(e.target.value);
                  setPage(0);
                }}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground uppercase tracking-wide">
                Stale (no sign-in ≥ N days)
              </label>
              <Input
                type="number"
                min={0}
                className="h-9 text-xs"
                placeholder="e.g. 90"
                value={staleDays}
                onChange={(e) => {
                  setStaleDays(e.target.value);
                  setPage(0);
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="w-[220px]">User</TableHead>
              <TableHead className="w-[90px]">Status</TableHead>
              <TableHead>Platform roles</TableHead>
              <TableHead>Workspaces</TableHead>
              <TableHead className="w-[100px]">Auth</TableHead>
              <TableHead className="w-[80px]">2FA</TableHead>
              <TableHead className="w-[110px]">Identity</TableHead>
              <TableHead className="w-[110px]">Security</TableHead>
              <TableHead className="w-[120px]">Last sign-in</TableHead>
              <TableHead className="w-[100px]">Created</TableHead>
              <TableHead className="w-[90px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 11 }).map((__, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="h-32 text-center text-muted-foreground">
                  <div className="flex flex-col items-center gap-2 py-6">
                    <Shield className="h-8 w-8 opacity-30" />
                    <span>No users match these filters.</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              items.map((u) => (
                <TableRow key={u.id} className="hover:bg-muted/30">
                  <TableCell>
                    <div className="flex items-center gap-2 min-w-0">
                      {u.avatarUrl ? (
                        <img src={u.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
                          {(u.displayName || u.primaryEmail || "?")[0]?.toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate">{u.displayName || "—"}</div>
                        <div className="text-xs text-muted-foreground truncate">{u.primaryEmail || "—"}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px] font-normal">
                      {u.accountStatus}
                    </Badge>
                    {!u.isActiveLegacy && u.accountStatus === "active" && (
                      <Badge variant="destructive" className="text-[10px] ml-1">
                        legacy inactive
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1 max-w-[200px]">
                      {u.platformRoles.length === 0 ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        u.platformRoles.map((r) => (
                          <Badge key={r} variant="secondary" className="text-[10px] font-normal">
                            {r}
                          </Badge>
                        ))
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs">
                    <span className="font-medium">{u.membershipSummary.activeCount}</span>
                    <span className="text-muted-foreground"> · </span>
                    <span className="text-muted-foreground truncate">{u.membershipSummary.topRolesLabel}</span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {u.authProviders.slice(0, 2).map((p) => p.label).join(", ") || "—"}
                    {u.authProviders.length > 2 ? ` +${u.authProviders.length - 2}` : ""}
                  </TableCell>
                  <TableCell>
                    {u.securityHealth.privilegedMissing2fa ? (
                      <Badge className="text-[10px] bg-red-100 text-red-800 border-red-200">Missing</Badge>
                    ) : u.securityHealth.twoFactorEnabled ? (
                      <Badge className="text-[10px] bg-emerald-50 text-emerald-800 border-emerald-200">On</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">
                        Off
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] capitalize ${healthBadgeClass(u.identityHealth.overallLevel)}`}
                    >
                      {u.identityHealth.overallLevel === "healthy" ? (
                        <CheckCircle2 className="h-3 w-3" />
                      ) : u.identityHealth.overallLevel === "info" ? (
                        <Info className="h-3 w-3" />
                      ) : (
                        <AlertTriangle className="h-3 w-3" />
                      )}
                      {u.identityHealth.overallLevel}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] capitalize ${healthBadgeClass(u.securityHealth.overallLevel)}`}
                    >
                      {u.securityHealth.overallLevel === "healthy" ? (
                        <CheckCircle2 className="h-3 w-3" />
                      ) : u.securityHealth.overallLevel === "info" ? (
                        <Info className="h-3 w-3" />
                      ) : (
                        <AlertTriangle className="h-3 w-3" />
                      )}
                      {u.securityHealth.overallLevel}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {u.lastSignedInAt ? fmtDateTime(new Date(u.lastSignedInAt).getTime()) : "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {fmtDateTime(new Date(u.createdAt).getTime())}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setDetailUserId(u.id)}>
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {total === 0 ? "0" : offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
        </span>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs tabular-nums">
            Page {page + 1} / {totalPages}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={offset + PAGE_SIZE >= total}
            onClick={() => setPage((p) => p + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Sheet open={detailUserId != null} onOpenChange={(o) => !o && setDetailUserId(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          {detailLoading || !detail ? (
            <div className="space-y-3 py-4">
              <Skeleton className="h-8 w-3/4" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  {detail.listSlice.displayName || "User"}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => copyText("User ID", String(detail.identity.userId))}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </SheetTitle>
                <SheetDescription className="text-left flex flex-wrap items-center gap-2">
                  <span>{detail.listSlice.primaryEmail || "No email"}</span>
                  {detail.listSlice.primaryEmail ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={() => copyText("Email", detail.listSlice.primaryEmail!)}
                    >
                      <Copy className="h-3 w-3" />
                      Copy email
                    </Button>
                  ) : null}
                </SheetDescription>
              </SheetHeader>

              <div className="space-y-6 py-4">
                <section>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Identity</h4>
                  <ul className="text-sm space-y-1">
                    <li>
                      <span className="text-muted-foreground">User ID:</span> {detail.identity.userId}
                    </li>
                    <li>
                      <span className="text-muted-foreground">Normalized email:</span>{" "}
                      {detail.identity.emailNormalized || "—"}
                    </li>
                    <li>
                      <span className="text-muted-foreground">Status:</span> {detail.identity.accountStatus}
                    </li>
                    <li>
                      <span className="text-muted-foreground">OpenID subject (legacy row):</span>{" "}
                      <code className="text-xs break-all">{detail.identity.openId}</code>
                    </li>
                    <li>
                      <span className="text-muted-foreground">Created:</span>{" "}
                      {fmtDateTime(new Date(detail.identity.createdAt).getTime())}
                    </li>
                    <li>
                      <span className="text-muted-foreground">Updated:</span>{" "}
                      {fmtDateTime(new Date(detail.identity.updatedAt).getTime())}
                    </li>
                    <li>
                      <span className="text-muted-foreground">Last sign-in:</span>{" "}
                      {detail.identity.lastSignedIn
                        ? fmtDateTime(new Date(detail.identity.lastSignedIn).getTime())
                        : "—"}
                    </li>
                    {detail.mergedIntoUser && (
                      <li>
                        <span className="text-muted-foreground">Merged into:</span>{" "}
                        <button
                          type="button"
                          className="text-primary underline-offset-2 hover:underline font-medium"
                          onClick={() => setDetailUserId(detail.mergedIntoUser!.userId)}
                        >
                          #{detail.mergedIntoUser.userId}{" "}
                          {detail.mergedIntoUser.displayLabel || detail.mergedIntoUser.primaryEmail || ""}
                        </button>
                      </li>
                    )}
                  </ul>
                </section>

                <Separator />

                <section>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    Anomalies & overlap
                  </h4>
                  {detail.anomalies.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No cross-cutting issues detected.</p>
                  ) : (
                    <ul className="flex flex-wrap gap-1.5">
                      {detail.anomalies.map((s) => (
                        <Badge
                          key={`${s.category}-${s.code}`}
                          variant="outline"
                          className={`text-[10px] font-normal ${healthBadgeClass(s.level)}`}
                        >
                          <span className="opacity-70 mr-1 uppercase">{s.category}</span>
                          {s.label}
                        </Badge>
                      ))}
                    </ul>
                  )}
                </section>

                <Separator />

                <section>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1">
                    <Shield className="h-3 w-3" />
                    Platform roles (global)
                  </h4>
                  {detail.platformRoles.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No active global platform grants.</p>
                  ) : (
                    <ul className="text-sm space-y-2">
                      {detail.platformRoles.map((r, i) => (
                        <li key={i} className="border rounded-md p-2">
                          <div className="font-medium">{r.role}</div>
                          <div className="text-xs text-muted-foreground">
                            Granted {r.grantedAt ? fmtDateTime(new Date(r.grantedAt).getTime()) : "—"}
                            {r.grantedByLabel ? ` · by ${r.grantedByLabel}` : ""}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                  {detail.revokedPlatformRoles.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-2">
                      {detail.revokedPlatformRoles.length} revoked grant(s) on record
                    </p>
                  )}
                </section>

                <Separator />

                <section>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1">
                    <Building2 className="h-3 w-3" />
                    Company memberships
                  </h4>
                  {detail.memberships.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No membership rows.</p>
                  ) : (
                    <ul className="text-sm space-y-2">
                      {detail.memberships.map((m) => (
                        <li key={m.memberId} className="border rounded-md p-2">
                          <div className="font-medium">{m.companyName}</div>
                          <div className="text-xs">
                            Role: {m.role} · {m.isActive ? "active" : "inactive"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Invited {m.invitedAt ? fmtDateTime(new Date(m.invitedAt).getTime()) : "—"} · Accepted{" "}
                            {m.acceptedAt ? fmtDateTime(new Date(m.acceptedAt).getTime()) : "—"}
                            {m.removedAt ? ` · Removed ${fmtDateTime(new Date(m.removedAt).getTime())}` : ""}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <Separator />

                <section>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1">
                    <KeyRound className="h-3 w-3" />
                    Auth providers
                  </h4>
                  {detail.authIdentities.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No linked identities.</p>
                  ) : (
                    <ul className="text-xs space-y-2 font-mono">
                      {detail.authIdentities.map((a) => (
                        <li key={a.id} className="border rounded p-2">
                          <div>
                            {a.providerLabel} {a.isPrimary ? "(primary)" : ""}
                          </div>
                          <div className="text-muted-foreground">{a.providerEmail || "—"}</div>
                          <div className="truncate opacity-70">{a.providerSubjectId}</div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <Separator />

                <section>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Security</h4>
                  <ul className="text-sm space-y-1">
                    <li>2FA: {detail.security.twoFactorEnabled ? "Enabled" : "Disabled"}</li>
                    <li>Verified at: {detail.security.twoFactorVerifiedAt ? fmtDateTime(new Date(detail.security.twoFactorVerifiedAt).getTime()) : "—"}</li>
                    <li>Step-up required: {detail.security.requiresStepUpAuth ? "Yes" : "No"}</li>
                    <li>Recovery codes: {detail.security.recoveryCodesPresent ? "Present" : "None"}</li>
                  </ul>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {detail.listSlice.securityHealth.signals.length === 0 ? (
                      <Badge className={healthBadgeClass("healthy")}>Healthy</Badge>
                    ) : (
                      detail.listSlice.securityHealth.signals.map((s) => (
                        <Badge key={s.code} variant="outline" className={`text-[10px] font-normal ${healthBadgeClass(s.level)}`}>
                          {s.label}
                        </Badge>
                      ))
                    )}
                  </div>
                </section>

                <Separator />

                <section>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    Identity health
                  </h4>
                  <div className="flex flex-wrap gap-1">
                    {detail.listSlice.identityHealth.signals.length === 0 ? (
                      <Badge className={healthBadgeClass("healthy")}>Healthy</Badge>
                    ) : (
                      detail.listSlice.identityHealth.signals.map((s) => (
                        <Badge key={s.code} variant="outline" className={`text-[10px] ${healthBadgeClass(s.level)}`}>
                          {s.label}
                        </Badge>
                      ))
                    )}
                  </div>
                </section>

                <Separator />

                <section className="rounded-md border border-dashed p-3 bg-muted/30">
                  <h4 className="text-xs font-semibold text-muted-foreground mb-1">Legacy diagnostics</h4>
                  <p className="text-xs text-muted-foreground mb-2">{detail.legacyDiagnostics.notes}</p>
                  <div className="text-xs font-mono space-y-1">
                    <div>users.role: {detail.legacyDiagnostics.usersRole}</div>
                    <div>users.platformRole (cache): {detail.legacyDiagnostics.usersPlatformRole}</div>
                  </div>
                </section>

                {detail.mergedFromUsers.length > 0 && (
                  <>
                    <Separator />
                    <section>
                      <h4 className="text-xs font-semibold text-amber-800 mb-2">Merged accounts pointing here</h4>
                      <ul className="text-sm space-y-1">
                        {detail.mergedFromUsers.map((m) => (
                          <li key={m.id}>
                            #{m.id} {m.displayLabel || m.primaryEmail || "—"}
                          </li>
                        ))}
                      </ul>
                    </section>
                  </>
                )}

                <Separator />

                <section>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    Recent audit
                  </h4>
                  {detail.recentAudit.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No recent entries.</p>
                  ) : (
                    <ul className="text-xs space-y-2">
                      {detail.recentAudit.map((a) => (
                        <li key={a.id} className="border-b border-border/60 pb-2">
                          <div className="font-medium">{a.action}</div>
                          <div className="text-muted-foreground">
                            {a.entityType} {a.entityId ?? ""} · {fmtDateTime(new Date(a.createdAt).getTime())}
                          </div>
                          {a.snippet && <div className="truncate opacity-80">{a.snippet}</div>}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <Separator />

                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant={detail.listSlice.isActiveLegacy ? "destructive" : "default"}
                    onClick={() =>
                      updateUserRoleMutation.mutate({ userId: detail.identity.userId, isActive: !detail.listSlice.isActiveLegacy })
                    }
                  >
                    {detail.listSlice.isActiveLegacy ? "Suspend (legacy isActive)" : "Activate"}
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <a href="/user-roles" target="_blank" rel="noreferrer">
                      <ExternalLink className="h-3 w-3 mr-1" />
                      User roles page
                    </a>
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
