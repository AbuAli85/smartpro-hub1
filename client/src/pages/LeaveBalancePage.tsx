import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Search, Calendar, ChevronRight, Download, TrendingDown, Info } from "lucide-react";

const LEAVE_COLORS: Record<string, string> = {
  annual: "bg-blue-500",
  sick: "bg-amber-500",
  emergency: "bg-orange-500",
};

const LEAVE_LABELS: Record<string, string> = {
  annual: "Annual",
  sick: "Sick",
  emergency: "Emergency",
};

function BalanceBar({ used, entitled, type }: { used: number; entitled: number; type: string }) {
  const pct = entitled > 0 ? Math.min(100, (used / entitled) * 100) : 0;
  const remaining = Math.max(0, entitled - used);
  const isLow = remaining <= 3 && entitled > 0;
  const isExhausted = remaining === 0 && entitled > 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{LEAVE_LABELS[type] ?? type}</span>
        <span className={`font-medium ${isExhausted ? "text-red-600 dark:text-red-400" : isLow ? "text-orange-600 dark:text-orange-400" : "text-foreground"}`}>
          {remaining} / {entitled} days left
        </span>
      </div>
      <Progress
        value={pct}
        className={`h-1.5 ${isExhausted ? "[&>div]:bg-red-500" : isLow ? "[&>div]:bg-orange-500" : "[&>div]:bg-blue-500"}`}
      />
    </div>
  );
}

export default function LeaveBalancePage() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "annual" | "sick">("name");

  const { data: summaryPayload, isLoading } = trpc.hr.getLeaveBalanceSummary.useQuery();
  const summary = summaryPayload?.employees ?? [];
  const policyCaps = summaryPayload?.policyCaps;

  const filtered = (summary ?? []).filter((emp) =>
    `${emp.name} ${emp.department}`.toLowerCase().includes(search.toLowerCase())
  );

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === "name") return a.name.localeCompare(b.name);
    const getRemaining = (emp: typeof a, type: string) => {
      const bal = emp.balances.find((b) => b.type === type);
      return bal ? bal.remaining : 0;
    };
    return getRemaining(a, sortBy) - getRemaining(b, sortBy);
  });

  const totalEmployees = summary?.length ?? 0;
  const exhaustedAnnual = (summary ?? []).filter((e) => {
    const bal = e.balances.find((b) => b.type === "annual");
    return bal && bal.remaining === 0;
  }).length;
  const lowAnnual = (summary ?? []).filter((e) => {
    const bal = e.balances.find((b) => b.type === "annual");
    return bal && bal.remaining > 0 && bal.remaining <= 5;
  }).length;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card px-6 py-5">
        <div className="max-w-7xl mx-auto flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Calendar size={20} className="text-primary" />
              Leave Balance Summary
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Annual, sick, and emergency balances use your company caps (or Oman-style defaults). Maternity and paternity are reference only.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate("/hr/leave")} className="gap-1.5">
            <ChevronRight size={14} /> Manage Leave Requests
          </Button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* KPI Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-blue-500/10">
                <Users size={18} className="text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-foreground">{totalEmployees}</div>
                <div className="text-xs text-muted-foreground uppercase tracking-wide">Active Employees</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-red-500/10">
                <TrendingDown size={18} className="text-red-600 dark:text-red-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-foreground">{exhaustedAnnual}</div>
                <div className="text-xs text-muted-foreground uppercase tracking-wide">Annual Leave Exhausted</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-orange-500/10">
                <Calendar size={18} className="text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-foreground">{lowAnnual}</div>
                <div className="text-xs text-muted-foreground uppercase tracking-wide">Low Annual Balance (≤5 days)</div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Entitlement Reference */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Leave caps (this company)</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            <div className="flex flex-wrap gap-4">
              {[
                { type: "annual", days: policyCaps?.annual ?? 30, label: "Annual leave" },
                { type: "sick", days: policyCaps?.sick ?? 15, label: "Sick (full-pay pool)" },
                { type: "emergency", days: policyCaps?.emergency ?? 6, label: "Emergency leave" },
                { type: "maternity", days: 50, label: "Maternity (reference)" },
                { type: "paternity", days: 3, label: "Paternity (reference)" },
              ].map((e) => (
                <div key={e.type} className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${LEAVE_COLORS[e.type] ?? "bg-gray-400"}`} />
                  <span className="text-sm text-foreground font-medium">{e.label}</span>
                  <Badge variant="outline" className="text-xs">{e.days} days</Badge>
                </div>
              ))}
            </div>
            <div className="flex gap-2 text-xs text-muted-foreground border-t pt-3">
              <Info className="w-4 h-4 shrink-0 text-primary" aria-hidden />
              <p>
                Approved leave this year is subtracted from annual, sick, and emergency caps above. Sick pool is a simple HR display limit, not the full statutory sick regime.                 Edit caps on{" "}
                <span className="font-medium text-foreground">Company Settings</span> (/company/settings) — Leave balance caps.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Search & Sort */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name or department..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9 text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Sort by:</span>
            {(["name", "annual", "sick"] as const).map((s) => (
              <Button
                key={s}
                variant={sortBy === s ? "default" : "outline"}
                size="sm"
                className="h-8 text-xs"
                onClick={() => setSortBy(s)}
              >
                {s === "name" ? "Name" : s === "annual" ? "Annual Remaining" : "Sick Remaining"}
              </Button>
            ))}
          </div>
        </div>

        {/* Employee Balance Table */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Users size={15} className="text-primary" />
              Employee Leave Balances
              {!isLoading && (
                <Badge variant="secondary" className="ml-auto text-xs">{sorted.length} employees</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {isLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 rounded-lg" />
                ))}
              </div>
            ) : sorted.length === 0 ? (
              <div className="text-center py-12">
                <Users size={32} className="text-muted-foreground mx-auto mb-3" />
                <p className="text-sm font-medium text-foreground">No employees found</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {search ? "Try adjusting your search" : "Add employees to see their leave balances"}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {sorted.map((emp) => (
                  <div key={emp.employeeId} className="py-4 first:pt-0 last:pb-0">
                    <div className="flex items-start gap-4">
                      {/* Employee info */}
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                        <span className="text-xs font-bold text-primary">
                          {emp.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-sm font-medium text-foreground">{emp.name}</span>
                          {emp.department && (
                            <Badge variant="outline" className="text-xs px-1.5 py-0 h-4">{emp.department}</Badge>
                          )}
                          {/* Flag employees with exhausted annual leave */}
                          {emp.balances.find((b) => b.type === "annual" && b.remaining === 0) && (
                            <Badge variant="destructive" className="text-xs px-1.5 py-0 h-4">Annual Exhausted</Badge>
                          )}
                          {emp.balances.find((b) => b.type === "annual" && b.remaining > 0 && b.remaining <= 5) && (
                            <Badge className="text-xs px-1.5 py-0 h-4 bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 border-orange-200">Low Balance</Badge>
                          )}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          {emp.balances.map((bal) => (
                            <BalanceBar key={bal.type} used={bal.used} entitled={bal.entitled} type={bal.type} />
                          ))}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs h-7 gap-1 shrink-0"
                        onClick={() => navigate(`/hr/leave?employee=${emp.employeeId}`)}
                      >
                        History <ChevronRight size={12} />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
