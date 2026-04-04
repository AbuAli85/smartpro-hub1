/**
 * Workforce Health Widget
 * Shows Critical / Warning / Incomplete / Healthy employee counts
 * with severity-bucketed employee lists and overall score.
 */
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import {
  XCircle, AlertTriangle, AlertCircle, CheckCircle2,
  Users, ArrowRight, RefreshCw, Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface SeverityRowProps {
  icon: React.ReactNode;
  label: string;
  count: number;
  color: string;
  bg: string;
  employees: Array<{ id: number; name: string; reason?: string; score?: number; missing?: string[] }>;
  onNavigate: () => void;
}

function SeverityRow({ icon, label, count, color, bg, employees, onNavigate }: SeverityRowProps) {
  if (count === 0) return null;
  return (
    <div className={`rounded-lg border p-3 ${bg}`}>
      <div className="flex items-center justify-between mb-2">
        <div className={`flex items-center gap-2 font-semibold text-sm ${color}`}>
          {icon}
          {label}
          <Badge className={`text-xs px-1.5 py-0 ${color} bg-transparent border-current`}>{count}</Badge>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className={`h-6 text-xs gap-1 ${color} hover:bg-white/50`}
          onClick={onNavigate}
        >
          View all <ArrowRight size={10} />
        </Button>
      </div>
      <div className="space-y-1">
        {employees.slice(0, 3).map((emp) => (
          <div key={emp.id} className="flex items-center justify-between text-xs">
            <span className="font-medium text-gray-700 truncate max-w-[160px]">{emp.name}</span>
            <span className={`text-xs ${color} opacity-80 truncate max-w-[140px]`}>
              {emp.reason ?? (emp.missing ? `Missing: ${emp.missing.slice(0, 2).join(", ")}` : `${emp.score}% complete`)}
            </span>
          </div>
        ))}
        {count > 3 && (
          <p className={`text-xs ${color} opacity-60`}>+{count - 3} more employees</p>
        )}
      </div>
    </div>
  );
}

export function WorkforceHealthWidget() {
  const [, navigate] = useLocation();
  const { activeCompanyId } = useActiveCompany();

  const { data, isLoading, refetch } = trpc.hr.getWorkforceHealth.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: !!activeCompanyId, staleTime: 5 * 60 * 1000 }
  );

  if (isLoading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3 animate-pulse">
        <div className="h-5 bg-gray-100 rounded w-40" />
        <div className="grid grid-cols-4 gap-2">
          {[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-gray-100 rounded-lg" />)}
        </div>
        <div className="h-20 bg-gray-100 rounded-lg" />
      </div>
    );
  }

  if (!data || data.total === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex items-center gap-2 mb-3">
          <Activity size={16} className="text-gray-400" />
          <h3 className="font-semibold text-sm text-gray-700">Workforce Health</h3>
        </div>
        <p className="text-xs text-gray-400 text-center py-4">No employees found. Add employees to see health metrics.</p>
      </div>
    );
  }

  const healthPct = data.total > 0 ? Math.round((data.healthy / data.total) * 100) : 0;

  const scoreColor =
    data.overallScore >= 80 ? "text-emerald-600" :
    data.overallScore >= 60 ? "text-amber-600" :
    "text-red-600";

  const scoreBg =
    data.overallScore >= 80 ? "bg-emerald-500" :
    data.overallScore >= 60 ? "bg-amber-500" :
    "bg-red-500";

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center">
            <Activity size={14} className="text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-sm text-gray-900">Workforce Health</h3>
            <p className="text-xs text-gray-400">{data.total} employees tracked</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <div className={`text-xl font-bold ${scoreColor}`}>{data.overallScore}%</div>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">Average profile completeness across all employees</p>
            </TooltipContent>
          </Tooltip>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => refetch()}>
            <RefreshCw size={12} className="text-gray-400" />
          </Button>
        </div>
      </div>

      {/* Score bar */}
      <div className="space-y-1">
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${scoreBg}`}
            style={{ width: `${data.overallScore}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-gray-400">
          <span>Profile completeness</span>
          <span>{healthPct}% healthy</span>
        </div>
      </div>

      {/* Severity grid */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "Critical", count: data.critical, icon: <XCircle size={14} />, color: "text-red-600", bg: "bg-red-50 border-red-200" },
          { label: "Warning", count: data.warning, icon: <AlertTriangle size={14} />, color: "text-amber-600", bg: "bg-amber-50 border-amber-200" },
          { label: "Incomplete", count: data.incomplete, icon: <AlertCircle size={14} />, color: "text-orange-600", bg: "bg-orange-50 border-orange-200" },
          { label: "Healthy", count: data.healthy, icon: <CheckCircle2 size={14} />, color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200" },
        ].map(({ label, count, icon, color, bg }) => (
          <Tooltip key={label}>
            <TooltipTrigger asChild>
              <button
                className={`rounded-lg border p-2 text-center cursor-pointer hover:opacity-80 transition-opacity ${bg}`}
                onClick={() => navigate("/hr/employees")}
              >
                <div className={`flex justify-center mb-1 ${color}`}>{icon}</div>
                <div className={`text-lg font-bold ${color}`}>{count}</div>
                <div className={`text-xs ${color} opacity-70`}>{label}</div>
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">{count} {label.toLowerCase()} employee{count !== 1 ? "s" : ""}</p>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>

      {/* Severity detail rows */}
      <div className="space-y-2">
        <SeverityRow
          icon={<XCircle size={13} />}
          label="Critical — Expired Documents"
          count={data.critical}
          color="text-red-700"
          bg="bg-red-50 border-red-200"
          employees={data.criticalEmployees}
          onNavigate={() => navigate("/hr/employees")}
        />
        <SeverityRow
          icon={<AlertTriangle size={13} />}
          label="Warning — Expiring Soon"
          count={data.warning}
          color="text-amber-700"
          bg="bg-amber-50 border-amber-200"
          employees={data.warningEmployees}
          onNavigate={() => navigate("/hr/employees")}
        />
        <SeverityRow
          icon={<AlertCircle size={13} />}
          label="Incomplete Profiles"
          count={data.incomplete}
          color="text-orange-700"
          bg="bg-orange-50 border-orange-200"
          employees={data.incompleteEmployees.map((e) => ({ ...e, reason: undefined }))}
          onNavigate={() => navigate("/hr/employees")}
        />
      </div>

      {/* Footer CTA */}
      <Button
        variant="outline"
        size="sm"
        className="w-full text-xs gap-2 border-gray-200 hover:bg-gray-50"
        onClick={() => navigate("/hr/employees")}
      >
        <Users size={12} />
        Manage Workforce
        <ArrowRight size={12} className="ml-auto" />
      </Button>
    </div>
  );
}
