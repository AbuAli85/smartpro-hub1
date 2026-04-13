/*
 * CompanySettingsPage (Workspace Settings)
 *
 * Workspace-level operational configuration:
 * HR compliance thresholds, leave balance caps, role login redirects,
 * and role navigation extensions.
 *
 * Company identity (name, address, contact, legal) is managed in
 * Company Profile (/company/profile).
 */
import React, { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Settings2,
  Save,
  AlertCircle,
  ShieldAlert,
  Clock,
  RotateCcw,
  LogIn,
  ChevronRight,
  Calendar,
  LayoutList,
  Building2,
} from "lucide-react";
import { getRoleDefaultRoute } from "@shared/clientNav";
import { NAV_EXTENSION_ROLE_KEYS, ROLE_NAV_SUMMARY } from "@shared/roleNavConfig";
import { mergeLeavePolicyCaps } from "@shared/leavePolicyCaps";

export default function CompanySettingsPage() {
  const { activeCompany, loading: companyLoading } = useActiveCompany();
  const utils = trpc.useUtils();

  // Fetch full company details
  const { data: companyData, isLoading: detailsLoading, refetch } = trpc.companies.getById.useQuery(
    { id: activeCompany?.id ?? 0 },
    { enabled: Boolean(activeCompany?.id) }
  );

  const updateMutation = trpc.companies.updateMyCompany.useMutation({
    onSuccess: () => {
      toast.success("Settings saved successfully");
      refetch();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to save settings");
    },
  });

  // HR Compliance: expiry warning threshold
  const [expiryDays, setExpiryDays] = useState<number>(30);
  const [expiryDaysInput, setExpiryDaysInput] = useState("30");
  const [savingExpiry, setSavingExpiry] = useState(false);

  const [leaveCapAnnual, setLeaveCapAnnual] = useState("30");
  const [leaveCapSick, setLeaveCapSick] = useState("15");
  const [leaveCapEmergency, setLeaveCapEmergency] = useState("6");
  const [savingLeaveCaps, setSavingLeaveCaps] = useState(false);

  const { data: expirySettings } = trpc.companies.getExpirySettings.useQuery(
    { companyId: activeCompany?.id ?? 0 },
    { enabled: Boolean(activeCompany?.id) }
  );
  useEffect(() => {
    if (expirySettings?.expiryWarningDays != null) {
      setExpiryDays(expirySettings.expiryWarningDays);
      setExpiryDaysInput(String(expirySettings.expiryWarningDays));
    }
  }, [expirySettings]);

  // Role Redirect Settings
  const ROLE_REDIRECT_OPTIONS: Record<string, { label: string; color: string; routes: { value: string; label: string }[] }> = {
    company_admin: {
      label: "Company Admin",
      color: "bg-violet-100 text-violet-700 border-violet-200",
      routes: [
        { value: "/dashboard", label: "Command center" },
        { value: "/dashboard", label: "Overview Dashboard" },
        { value: "/operations", label: "Operations overview" },
        { value: "/hr/employees", label: "HR — Employees" },
        { value: "/payroll", label: "Payroll Engine" },
        { value: "/crm", label: "CRM" },
        { value: "/company/hub", label: "Company Hub" },
      ],
    },
    hr_admin: {
      label: "HR Admin",
      color: "bg-blue-100 text-blue-700 border-blue-200",
      routes: [
        { value: "/hr/employees", label: "HR — Employees" },
        { value: "/hr/recruitment", label: "HR — Recruitment" },
        { value: "/hr/leave", label: "HR — Leave & Payroll" },
        { value: "/hr/attendance", label: "HR — Attendance" },
        { value: "/hr/tasks", label: "HR — Task Manager" },
        { value: "/hr/announcements", label: "HR — Announcements" },
        { value: "/hr/expiry-dashboard", label: "HR — Expiry Dashboard" },
        { value: "/my-team", label: "My Team" },
        { value: "/dashboard", label: "Command center" },
      ],
    },
    finance_admin: {
      label: "Finance Admin",
      color: "bg-emerald-100 text-emerald-700 border-emerald-200",
      routes: [
        { value: "/payroll", label: "Payroll Engine" },
        { value: "/payroll/process", label: "Payroll Process" },
        { value: "/reports", label: "PDF Reports" },
        { value: "/dashboard", label: "Command center" },
      ],
    },
    company_member: {
      label: "Company Member (Staff)",
      color: "bg-gray-100 text-gray-700 border-gray-200",
      routes: [
        { value: "/my-portal", label: "Employee home" },
        { value: "/dashboard", label: "Overview Dashboard" },
      ],
    },
    reviewer: {
      label: "Reviewer",
      color: "bg-amber-100 text-amber-700 border-amber-200",
      routes: [
        { value: "/dashboard", label: "Command center" },
        { value: "/dashboard", label: "Overview Dashboard" },
        { value: "/company/hub", label: "Company Hub" },
      ],
    },
    external_auditor: {
      label: "External Auditor",
      color: "bg-orange-100 text-orange-700 border-orange-200",
      routes: [
        { value: "/dashboard", label: "Command center" },
        { value: "/dashboard", label: "Overview Dashboard" },
      ],
    },
  };

  const [roleRedirects, setRoleRedirects] = useState<Record<string, string>>({});
  const [savingRoleRedirects, setSavingRoleRedirects] = useState(false);

  const { data: roleRedirectData } = trpc.companies.getRoleRedirectSettings.useQuery(
    { companyId: activeCompany?.id ?? 0 },
    { enabled: Boolean(activeCompany?.id) }
  );
  useEffect(() => {
    if (roleRedirectData?.settings) {
      setRoleRedirects(roleRedirectData.settings);
    }
  }, [roleRedirectData]);

  const updateRoleRedirectMutation = trpc.companies.updateRoleRedirectSettings.useMutation({
    onSuccess: () => {
      toast.success("Role redirect settings saved successfully");
    },
    onError: (err) => {
      toast.error(err.message || "Failed to save role redirect settings");
    },
  });

  const handleSaveRoleRedirects = async () => {
    if (!activeCompany?.id) return;
    setSavingRoleRedirects(true);
    try {
      await updateRoleRedirectMutation.mutateAsync({
        companyId: activeCompany.id,
        settings: roleRedirects as any,
      });
    } finally {
      setSavingRoleRedirects(false);
    }
  };

  const handleResetRoleRedirects = async () => {
    if (!activeCompany?.id) return;
    setSavingRoleRedirects(true);
    try {
      await updateRoleRedirectMutation.mutateAsync({
        companyId: activeCompany.id,
        settings: {} as any,
      });
      setRoleRedirects({});
      toast.success("Role redirects reset to system defaults");
    } finally {
      setSavingRoleRedirects(false);
    }
  };

  const [navExtDraft, setNavExtDraft] = useState<Record<string, string>>({});
  const [savingNavExt, setSavingNavExt] = useState(false);
  const { data: navExtData } = trpc.companies.getRoleNavExtensions.useQuery(
    { companyId: activeCompany?.id ?? 0 },
    { enabled: Boolean(activeCompany?.id) },
  );
  useEffect(() => {
    if (!navExtData?.extensions) return;
    const next: Record<string, string> = {};
    for (const key of NAV_EXTENSION_ROLE_KEYS) {
      const arr = navExtData.extensions[key];
      next[key] = Array.isArray(arr) ? arr.join(", ") : "";
    }
    setNavExtDraft(next);
  }, [navExtData]);

  const updateNavExtMutation = trpc.companies.updateRoleNavExtensions.useMutation({
    onSuccess: () => {
      toast.success("Role navigation extensions saved");
      void utils.companies.myCompany.invalidate();
      void utils.companies.getRoleNavExtensions.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to save navigation extensions");
    },
  });

  const handleSaveNavExt = async () => {
    if (!activeCompany?.id) return;
    setSavingNavExt(true);
    try {
      const out: Record<string, string[]> = {};
      for (const key of NAV_EXTENSION_ROLE_KEYS) {
        const raw = navExtDraft[key]?.trim() ?? "";
        if (!raw) continue;
        out[key] = raw
          .split(/[\s,]+/)
          .filter(Boolean)
          .map((p) => (p.startsWith("/") ? p : `/${p}`));
      }
      await updateNavExtMutation.mutateAsync({ companyId: activeCompany.id, extensions: out });
    } finally {
      setSavingNavExt(false);
    }
  };

  const handleResetNavExt = async () => {
    if (!activeCompany?.id) return;
    setSavingNavExt(true);
    try {
      await updateNavExtMutation.mutateAsync({ companyId: activeCompany.id, extensions: {} });
      setNavExtDraft({});
    } finally {
      setSavingNavExt(false);
    }
  };

  const canEditNavExtensions = activeCompany?.role === "company_admin";

  const handleSaveExpiry = async () => {
    if (!activeCompany?.id) return;
    const days = parseInt(expiryDaysInput, 10);
    if (isNaN(days) || days < 1 || days > 365) {
      toast.error("Please enter a value between 1 and 365 days");
      return;
    }
    setSavingExpiry(true);
    try {
      await updateMutation.mutateAsync({ companyId: activeCompany.id, expiryWarningDays: days } as any);
      setExpiryDays(days);
      toast.success(`Expiry warning threshold set to ${days} days`);
    } finally {
      setSavingExpiry(false);
    }
  };

  useEffect(() => {
    if (!companyData) return;
    const c = companyData as { leavePolicyCaps?: Partial<Record<"annual" | "sick" | "emergency", number>> | null };
    const caps = mergeLeavePolicyCaps(c.leavePolicyCaps ?? null);
    setLeaveCapAnnual(String(caps.annual));
    setLeaveCapSick(String(caps.sick));
    setLeaveCapEmergency(String(caps.emergency));
  }, [companyData]);

  const handleSaveLeaveCaps = async () => {
    if (!activeCompany?.id) return;
    const annual = parseInt(leaveCapAnnual, 10);
    const sick = parseInt(leaveCapSick, 10);
    const emergency = parseInt(leaveCapEmergency, 10);
    if ([annual, sick, emergency].some((n) => Number.isNaN(n) || n < 0 || n > 366)) {
      toast.error("Enter whole days between 0 and 366 for each leave type.");
      return;
    }
    setSavingLeaveCaps(true);
    try {
      await updateMutation.mutateAsync({
        companyId: activeCompany.id,
        leavePolicyCaps: { annual, sick, emergency },
      } as any);
      toast.success("Leave balance caps saved");
    } finally {
      setSavingLeaveCaps(false);
    }
  };

  const handleResetLeaveCaps = async () => {
    if (!activeCompany?.id) return;
    setSavingLeaveCaps(true);
    try {
      await updateMutation.mutateAsync({
        companyId: activeCompany.id,
        leavePolicyCaps: null,
      } as any);
      const d = mergeLeavePolicyCaps(null);
      setLeaveCapAnnual(String(d.annual));
      setLeaveCapSick(String(d.sick));
      setLeaveCapEmergency(String(d.emergency));
      toast.success("Leave caps reset to Oman-style defaults");
    } finally {
      setSavingLeaveCaps(false);
    }
  };

  if (companyLoading || detailsLoading) {
    return (
      <div className="p-8 space-y-4 animate-pulse">
        <div className="h-8 bg-muted rounded w-48" />
        <div className="h-4 bg-muted rounded w-64" />
        <div className="h-64 bg-muted rounded" />
      </div>
    );
  }

  if (!activeCompany) {
    return (
      <div className="p-8 text-center">
        <AlertCircle className="mx-auto mb-3 text-muted-foreground" size={40} />
        <p className="text-muted-foreground">No company selected. Please select a company first.</p>
      </div>
    );
  }

  const canEdit = ["owner", "company_admin", "hr_admin"].includes(activeCompany.role ?? "");

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Settings2 size={22} className="text-primary" />
            Workspace Settings
          </h1>
          <p className="text-muted-foreground mt-1">
            Operational configuration for{" "}
            <span className="font-medium text-foreground">{activeCompany.name}</span>.
            To edit company identity (name, address, legal), go to{" "}
            <a href="/company/profile" className="text-primary underline underline-offset-2 hover:no-underline">Company Profile</a>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={canEdit ? "default" : "secondary"}>
            {canEdit ? "Can Edit" : "View Only"}
          </Badge>
        </div>
      </div>

      {/* HR Compliance Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldAlert size={16} className="text-amber-500" /> HR Compliance Settings
          </CardTitle>
          <CardDescription>Configure document expiry warning thresholds for visas, work permits, and other time-sensitive documents</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-4">
            <div className="space-y-1.5 flex-1 max-w-xs">
              <Label htmlFor="expiryWarningDays" className="flex items-center gap-1.5">
                <Clock size={12} />
                Expiry Warning Threshold (days)
              </Label>
              <Input
                id="expiryWarningDays"
                type="number"
                min={1}
                max={365}
                value={expiryDaysInput}
                onChange={(e) => setExpiryDaysInput(e.target.value)}
                placeholder="30"
                disabled={!canEdit}
                className="w-32"
              />
              <p className="text-xs text-muted-foreground">
                Documents expiring within this many days will show an amber warning badge. Currently: <strong>{expiryDays} days</strong>.
              </p>
            </div>
            {canEdit && (
              <Button
                onClick={handleSaveExpiry}
                disabled={savingExpiry}
                variant="outline"
                className="gap-2 mb-6"
              >
                <Save size={14} />
                {savingExpiry ? "Saving..." : "Save Threshold"}
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-3 text-xs">
            {[7, 14, 30, 60, 90].map((d) => (
              <button
                key={d}
                type="button"
                disabled={!canEdit}
                onClick={() => { setExpiryDaysInput(String(d)); }}
                className={`px-3 py-1 rounded-full border transition-colors ${
                  expiryDaysInput === String(d)
                    ? "bg-amber-100 border-amber-400 text-amber-700 font-semibold"
                    : "border-border text-muted-foreground hover:border-amber-300 hover:text-amber-600"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {d}d
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Leave balance caps (portal + HR summaries) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar size={16} className="text-primary" /> Leave balance caps
          </CardTitle>
          <CardDescription>
            Annual, sick, and emergency limits for the employee portal and HR leave balance summary. Reset restores the
            built-in Oman-style defaults (30 / 15 / 6).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="leaveCapAnnual">Annual (days)</Label>
              <Input
                id="leaveCapAnnual"
                type="number"
                min={0}
                max={366}
                value={leaveCapAnnual}
                onChange={(e) => setLeaveCapAnnual(e.target.value)}
                disabled={!canEdit}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="leaveCapSick">Sick full-pay pool (days)</Label>
              <Input
                id="leaveCapSick"
                type="number"
                min={0}
                max={366}
                value={leaveCapSick}
                onChange={(e) => setLeaveCapSick(e.target.value)}
                disabled={!canEdit}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="leaveCapEmergency">Emergency (days)</Label>
              <Input
                id="leaveCapEmergency"
                type="number"
                min={0}
                max={366}
                value={leaveCapEmergency}
                onChange={(e) => setLeaveCapEmergency(e.target.value)}
                disabled={!canEdit}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            This is not legal advice. Statutory sick leave in Oman can exceed this pool; use these numbers as operational caps
            until payroll-grade rules are configured elsewhere.
          </p>
          {canEdit && (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="default" className="gap-2" disabled={savingLeaveCaps} onClick={handleSaveLeaveCaps}>
                <Save size={14} />
                {savingLeaveCaps ? "Saving…" : "Save leave caps"}
              </Button>
              <Button type="button" variant="outline" className="gap-2" disabled={savingLeaveCaps} onClick={handleResetLeaveCaps}>
                <RotateCcw size={14} />
                Reset to defaults
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Role Redirect Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <LogIn size={16} className="text-primary" /> Role Login Redirect Settings
          </CardTitle>
          <CardDescription>
            Customize which page each role is redirected to after logging in. Leave a role on "System Default" to use the built-in default.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {Object.entries(ROLE_REDIRECT_OPTIONS).map(([roleKey, roleConfig]) => {
            const currentValue = roleRedirects[roleKey] ?? "";
            const systemDefault = getRoleDefaultRoute(roleKey);
            const systemDefaultLabel = roleConfig.routes.find(r => r.value === systemDefault)?.label ?? systemDefault;
            return (
              <div key={roleKey} className="flex items-center gap-4 p-3 rounded-lg border bg-muted/20">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${roleConfig.color}`}>
                      {roleConfig.label}
                    </span>
                    {!currentValue && (
                      <span className="text-xs text-muted-foreground italic">
                        Using system default: {systemDefaultLabel}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <ChevronRight size={12} className="text-muted-foreground shrink-0" />
                    <span className="text-xs text-muted-foreground">Redirects to:</span>
                    <Select
                      value={currentValue || "__default__"}
                      onValueChange={(val) => {
                        if (val === "__default__") {
                          setRoleRedirects(prev => {
                            const next = { ...prev };
                            delete next[roleKey];
                            return next;
                          });
                        } else {
                          setRoleRedirects(prev => ({ ...prev, [roleKey]: val }));
                        }
                      }}
                      disabled={!canEdit}
                    >
                      <SelectTrigger className="h-8 text-xs w-56">
                        <SelectValue placeholder="System Default" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__default__">
                          <span className="text-muted-foreground">System Default ({systemDefaultLabel})</span>
                        </SelectItem>
                        {roleConfig.routes.map(route => (
                          <SelectItem key={route.value} value={route.value}>
                            {route.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            );
          })}
          {canEdit && (
            <div className="flex items-center gap-3 pt-2">
              <Button
                onClick={handleSaveRoleRedirects}
                disabled={savingRoleRedirects}
                size="sm"
                className="gap-2"
              >
                <Save size={13} />
                {savingRoleRedirects ? "Saving..." : "Save Redirect Settings"}
              </Button>
              <Button
                onClick={handleResetRoleRedirects}
                disabled={savingRoleRedirects}
                size="sm"
                variant="outline"
                className="gap-2 text-muted-foreground"
              >
                <RotateCcw size={13} />
                Reset All to Defaults
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <LayoutList size={16} className="text-primary" /> Role navigation extensions
          </CardTitle>
          <CardDescription>
            Optional extra path prefixes for each role (comma or space separated). These add to the built-in role menus
            in the sidebar and route guard. Platform-only URLs such as /admin or /user-roles are rejected automatically.
            {!canEditNavExtensions && (
              <span className="block mt-1 text-amber-700 dark:text-amber-300">
                Only company administrators can edit these settings.
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {NAV_EXTENSION_ROLE_KEYS.map((roleKey) => (
            <div key={roleKey} className="space-y-1.5 p-3 rounded-lg border bg-muted/20">
              <Label className="text-xs font-semibold">
                {ROLE_REDIRECT_OPTIONS[roleKey]?.label ?? roleKey}
              </Label>
              <p className="text-[11px] text-muted-foreground leading-snug">{ROLE_NAV_SUMMARY[roleKey]}</p>
              <Textarea
                placeholder="/hr/tasks, /company/documents"
                value={navExtDraft[roleKey] ?? ""}
                onChange={(e) => setNavExtDraft((prev) => ({ ...prev, [roleKey]: e.target.value }))}
                disabled={!canEditNavExtensions}
                rows={2}
                className="text-xs font-mono"
              />
            </div>
          ))}
          {canEditNavExtensions && (
            <div className="flex flex-wrap gap-2 pt-2">
              <Button size="sm" onClick={handleSaveNavExt} disabled={savingNavExt} className="gap-2">
                <Save size={13} />
                {savingNavExt ? "Saving…" : "Save navigation extensions"}
              </Button>
              <Button size="sm" variant="outline" onClick={handleResetNavExt} disabled={savingNavExt}>
                <RotateCcw size={13} />
                Clear all
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {!canEdit && (
        <div className="flex items-center gap-2 p-4 rounded-lg bg-muted/50 text-muted-foreground text-sm">
          <AlertCircle size={16} />
          You have view-only access. Contact your company admin to make changes.
        </div>
      )}
    </div>
  );
}
