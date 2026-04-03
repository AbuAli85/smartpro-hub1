import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users, Search, CheckCircle2, AlertCircle, AlertTriangle,
  ChevronRight, UserCheck, TrendingUp,
} from "lucide-react";

const FIELD_LABELS: Record<string, string> = {
  firstName: "First Name",
  lastName: "Last Name",
  email: "Email",
  phone: "Phone",
  nationality: "Nationality",
  department: "Department",
  position: "Position",
  hireDate: "Hire Date",
  salary: "Salary",
};

function ScoreBadge({ score }: { score: number }) {
  if (score >= 90) return <Badge className="text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200">Complete</Badge>;
  if (score >= 60) return <Badge className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200">Partial</Badge>;
  return <Badge variant="destructive" className="text-xs">Incomplete</Badge>;
}

export default function EmployeeCompletenessPage() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "complete" | "partial" | "incomplete">("all");

  const { data: completeness, isLoading } = trpc.hr.getEmployeeCompleteness.useQuery();

  const filtered = (completeness ?? []).filter((emp) => {
    const matchSearch = `${emp.name} ${emp.department}`.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === "all" || emp.status === filter;
    return matchSearch && matchFilter;
  });

  const sorted = [...filtered].sort((a, b) => a.score - b.score);

  const total = completeness?.length ?? 0;
  const completeCount = (completeness ?? []).filter((e) => e.status === "complete").length;
  const partialCount = (completeness ?? []).filter((e) => e.status === "partial").length;
  const incompleteCount = (completeness ?? []).filter((e) => e.status === "incomplete").length;
  const avgScore = total > 0 ? Math.round((completeness ?? []).reduce((s, e) => s + e.score, 0) / total) : 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card px-6 py-5">
        <div className="max-w-7xl mx-auto flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <UserCheck size={20} className="text-primary" />
              Employee Profile Completeness
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Track which employee records are missing required information
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate("/my-team")} className="gap-1.5">
            <Users size={14} /> Manage Employees
          </Button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* KPI Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-blue-500/10">
                <TrendingUp size={18} className="text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-foreground">{avgScore}%</div>
                <div className="text-xs text-muted-foreground uppercase tracking-wide">Avg. Completeness</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-emerald-500/10">
                <CheckCircle2 size={18} className="text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-foreground">{completeCount}</div>
                <div className="text-xs text-muted-foreground uppercase tracking-wide">Complete (≥90%)</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-amber-500/10">
                <AlertCircle size={18} className="text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-foreground">{partialCount}</div>
                <div className="text-xs text-muted-foreground uppercase tracking-wide">Partial (60–89%)</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-red-500/10">
                <AlertTriangle size={18} className="text-red-600 dark:text-red-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-foreground">{incompleteCount}</div>
                <div className="text-xs text-muted-foreground uppercase tracking-wide">Incomplete (&lt;60%)</div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Scoring Explanation */}
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4">
            <p className="text-sm font-medium text-foreground mb-1">How completeness is scored</p>
            <p className="text-xs text-muted-foreground">
              <strong>70 points</strong> for required fields: first name, last name, email, phone, nationality, department, position, hire date, salary. &nbsp;
              <strong>30 points</strong> for optional fields: passport, civil ID, date of birth, gender, PASI number, bank account, emergency contact, work permit, visa.
            </p>
          </CardContent>
        </Card>

        {/* Search & Filter */}
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
            {(["all", "incomplete", "partial", "complete"] as const).map((f) => (
              <Button
                key={f}
                variant={filter === f ? "default" : "outline"}
                size="sm"
                className="h-8 text-xs capitalize"
                onClick={() => setFilter(f)}
              >
                {f === "all" ? `All (${total})` : f === "complete" ? `Complete (${completeCount})` : f === "partial" ? `Partial (${partialCount})` : `Incomplete (${incompleteCount})`}
              </Button>
            ))}
          </div>
        </div>

        {/* Employee List */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <UserCheck size={15} className="text-primary" />
              Employee Records
              {!isLoading && (
                <Badge variant="secondary" className="ml-auto text-xs">{sorted.length} shown</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 rounded-lg" />
                ))}
              </div>
            ) : sorted.length === 0 ? (
              <div className="text-center py-12">
                <UserCheck size={32} className="text-muted-foreground mx-auto mb-3" />
                <p className="text-sm font-medium text-foreground">No employees found</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {search ? "Try adjusting your search" : "Add employees to track profile completeness"}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {sorted.map((emp) => (
                  <div key={emp.employeeId} className="py-4 first:pt-0 last:pb-0">
                    <div className="flex items-start gap-4">
                      {/* Avatar */}
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                        emp.status === "complete" ? "bg-emerald-100 dark:bg-emerald-900/30" :
                        emp.status === "partial" ? "bg-amber-100 dark:bg-amber-900/30" :
                        "bg-red-100 dark:bg-red-900/30"
                      }`}>
                        <span className={`text-xs font-bold ${
                          emp.status === "complete" ? "text-emerald-700 dark:text-emerald-400" :
                          emp.status === "partial" ? "text-amber-700 dark:text-amber-400" :
                          "text-red-700 dark:text-red-400"
                        }`}>
                          {emp.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                        </span>
                      </div>
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <span className="text-sm font-medium text-foreground">{emp.name}</span>
                          {emp.department && (
                            <Badge variant="outline" className="text-xs px-1.5 py-0 h-4">{emp.department}</Badge>
                          )}
                          <ScoreBadge score={emp.score} />
                        </div>
                        {/* Progress bar */}
                        <div className="flex items-center gap-3 mb-2">
                          <Progress
                            value={emp.score}
                            className={`h-2 flex-1 ${
                              emp.status === "complete" ? "[&>div]:bg-emerald-500" :
                              emp.status === "partial" ? "[&>div]:bg-amber-500" :
                              "[&>div]:bg-red-500"
                            }`}
                          />
                          <span className="text-xs font-bold text-foreground w-10 text-right shrink-0">{emp.score}%</span>
                        </div>
                        {/* Missing fields */}
                        {emp.missingRequired.length > 0 && (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs text-muted-foreground">Missing:</span>
                            {emp.missingRequired.map((f) => (
                              <Badge key={f} variant="outline" className="text-xs px-1.5 py-0 h-4 border-red-200 text-red-600 dark:text-red-400">
                                {FIELD_LABELS[f] ?? f}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                      {/* Action */}
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs h-7 gap-1 shrink-0"
                        onClick={() => navigate(`/business/employees/${emp.employeeId}`)}
                      >
                        Edit <ChevronRight size={12} />
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
