/**
 * PromoterAssignmentFormSection
 *
 * Pure render component for the promoter assignment form fields.
 * Consumes state + handlers from usePromoterAssignmentForm.
 *
 * Used by:
 *   - PromoterAssignmentsPage (create + edit dialogs)
 *   - ContractsPage (embedded quick-create dialog)
 *   - ContractDetailPage (edit dialog)
 *
 * Sections:
 *   1. Contract parties (first party / client + second party / employer)
 *   2. Work location (attendance site picker + bilingual free-text)
 *   3. Promoter employee + identity fields
 *   4. Contract details (dates, reference, issue date, status)
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { DateInput } from "@/components/ui/date-input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertCircle,
  Building2,
  MapPin,
  Shield,
  Users,
} from "lucide-react";
import type { usePromoterAssignmentForm } from "./usePromoterAssignmentForm";

type FormHook = ReturnType<typeof usePromoterAssignmentForm>;

type Props = {
  form: FormHook;
  /** Hide the status field in create mode (defaults to active) */
  showStatus?: boolean;
  disabled?: boolean;
};

export function PromoterAssignmentFormSection({ form, showStatus = true, disabled = false }: Props) {
  const {
    state,
    set,
    setClient,
    setEmployer,
    setClientFromFlowOption,
    onSelectEmployee,
    onSelectSite,
    pickers,
    pickersLoading,
    flowClientOptions,
    flowClientOptionsLoading,
    clientSites,
    sitesLoading,
    employerEmployees,
    employeesLoading,
    employeesError,
    employeesErrorObj,
    refetchEmployees,
    employerEmployeesEnabled,
  } = form;

  const { activeCompany } = useActiveCompany();
  const utils = trpc.useUtils();
  const [externalOpen, setExternalOpen] = useState(false);
  const [extNameEn, setExtNameEn] = useState("");
  const [extNameAr, setExtNameAr] = useState("");
  const [extReg, setExtReg] = useState("");

  const createExternal = trpc.contractManagement.createManagedExternalClient.useMutation({
    onError: (e) => toast.error(e.message),
  });

  const clientFlowSelectValue =
    state.clientSelectionKind === "platform" && typeof state.clientCompanyId === "number"
      ? `platform:${state.clientCompanyId}`
      : state.clientSelectionKind === "external_party" && state.clientPartyId
        ? `external:${state.clientPartyId}`
        : "";

  const employerPerspective = state.creationPerspective === "employer";

  const platformClientForSites =
    employerPerspective && state.clientSelectionKind === "platform" && typeof state.clientCompanyId === "number"
      ? state.clientCompanyId
      : !employerPerspective && typeof state.clientCompanyId === "number"
        ? state.clientCompanyId
        : 0;

  return (
    <div className="space-y-6">
      {/* ── 1. Contract Parties ────────────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Building2 className="h-4 w-4 text-primary" />
          Contract parties
        </div>
        {employerPerspective ? (
          <>
            <p className="text-xs text-muted-foreground -mt-2 leading-relaxed">
              You are creating this contract as the <strong className="text-foreground">employer (second party)</strong>.
              The <strong className="text-foreground">client (first party)</strong> hosts the work site; choose a
              platform company or an external client your company manages.{" "}
              <strong className="text-foreground">Promoter employees</strong> always come from your employer company
              only. <strong className="text-foreground">Work location</strong> belongs to the client — use their saved
              sites when the client is on the platform, or type the address manually for an external client.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Second party — Employer (your company)</Label>
                <Input
                  className="h-11 bg-muted/50"
                  readOnly
                  disabled={disabled}
                  value={
                    typeof state.employerCompanyId === "number"
                      ? activeCompany?.name && activeCompany.id === state.employerCompanyId
                        ? activeCompany.name
                        : `Company #${state.employerCompanyId}`
                      : "—"
                  }
                />
                <p className="text-[11px] text-muted-foreground">Locked to your active company from the switcher.</p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label>
                    First party — Client <span className="text-destructive">*</span>
                  </Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    disabled={disabled}
                    onClick={() => setExternalOpen(true)}
                  >
                    New external client
                  </Button>
                </div>
                <Select
                  value={clientFlowSelectValue}
                  onValueChange={(v) => {
                    const [kind, rawId] = v.split(":");
                    const id = rawId ?? "";
                    if (kind === "platform") {
                      const row = flowClientOptions.find(
                        (o) => o.kind === "platform" && o.companyId === Number(id)
                      );
                      if (row?.kind === "platform") setClientFromFlowOption(row);
                    } else if (kind === "external") {
                      const row = flowClientOptions.find(
                        (o) => o.kind === "external_party" && o.partyId === id
                      );
                      if (row?.kind === "external_party") setClientFromFlowOption(row);
                    }
                  }}
                  disabled={disabled || flowClientOptionsLoading}
                >
                  <SelectTrigger className="h-11 w-full">
                    <SelectValue
                      placeholder={
                        flowClientOptionsLoading ? "Loading clients…" : "Select client (platform or external)…"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent className="max-h-[min(24rem,70vh)]">
                    {flowClientOptions.map((o) =>
                      o.kind === "platform" ? (
                        <SelectItem key={`p-${o.companyId}`} value={`platform:${o.companyId}`}>
                          <span className="font-medium">{o.displayNameEn}</span>
                          <span className="text-muted-foreground text-xs ml-1">(platform)</span>
                        </SelectItem>
                      ) : (
                        <SelectItem key={`e-${o.partyId}`} value={`external:${o.partyId}`}>
                          <span className="font-medium">{o.displayNameEn}</span>
                          <span className="text-muted-foreground text-xs ml-1">(external)</span>
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </>
        ) : (
          <>
            <p className="text-xs text-muted-foreground -mt-2">
              <strong className="text-foreground">First party</strong> is the client who owns the work site.{" "}
              <strong className="text-foreground">Second party</strong> is the employer who supplies the promoter.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>
                  First party — Client <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={state.clientCompanyId === "" ? "" : String(state.clientCompanyId)}
                  onValueChange={(v) => setClient(Number(v))}
                  disabled={disabled || pickersLoading}
                >
                  <SelectTrigger className="h-11 w-full">
                    <SelectValue
                      placeholder={pickersLoading ? "Loading companies…" : "Select client company…"}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {(pickers?.clientOptions ?? []).map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}
                        {c.nameAr ? ` · ${c.nameAr}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>
                  Second party — Employer <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={state.employerCompanyId === "" ? "" : String(state.employerCompanyId)}
                  onValueChange={(v) => setEmployer(Number(v))}
                  disabled={
                    disabled ||
                    typeof state.clientCompanyId !== "number" ||
                    state.clientCompanyId <= 0
                  }
                >
                  <SelectTrigger className="h-11 w-full">
                    <SelectValue placeholder="Select employer company…" />
                  </SelectTrigger>
                  <SelectContent>
                    {(pickers?.employerOptions ?? []).map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}
                        {c.nameAr ? ` · ${c.nameAr}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </>
        )}
      </section>

      <Dialog open={externalOpen} onOpenChange={setExternalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New external client</DialogTitle>
            <DialogDescription>
              Creates a counterparty record managed by your employer company. If this client later joins the platform,
              an admin can link this party to their tenant without breaking contract history.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label>Display name (English) *</Label>
              <Input value={extNameEn} onChange={(e) => setExtNameEn(e.target.value)} className="h-10" />
            </div>
            <div className="space-y-2">
              <Label>Display name (Arabic)</Label>
              <Input value={extNameAr} onChange={(e) => setExtNameAr(e.target.value)} className="h-10" dir="rtl" />
            </div>
            <div className="space-y-2">
              <Label>Registration / CR (optional)</Label>
              <Input value={extReg} onChange={(e) => setExtReg(e.target.value)} className="h-10 font-mono text-sm" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setExternalOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!extNameEn.trim() || createExternal.isPending}
              onClick={() =>
                createExternal.mutate(
                  {
                    displayNameEn: extNameEn.trim(),
                    displayNameAr: extNameAr.trim() || undefined,
                    registrationNumber: extReg.trim() || undefined,
                  },
                  {
                    async onSuccess(data, variables) {
                      toast.success("External client saved");
                      setExternalOpen(false);
                      setExtNameEn("");
                      setExtNameAr("");
                      setExtReg("");
                      await utils.contractManagement.promoterFlowClientOptions.invalidate();
                      setClientFromFlowOption({
                        kind: "external_party",
                        partyId: data.partyId,
                        displayNameEn: variables.displayNameEn,
                        displayNameAr: variables.displayNameAr ?? null,
                        registrationNumber: variables.registrationNumber ?? null,
                      });
                    },
                  }
                )
              }
            >
              Save client
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Separator />

      {/* ── 2. Work Location ─────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <MapPin className="h-4 w-4 text-primary" />
          Work location
          <span className="text-xs font-normal text-muted-foreground ml-1">— belongs to first party (client)</span>
        </div>

        {/* Saved site picker */}
        <div className="space-y-2">
          <Label>Client attendance site (optional pre-fill)</Label>
          <Select
            value={state.clientSiteId === "" ? "__manual__" : String(state.clientSiteId)}
            onValueChange={(v) =>
              onSelectSite(v === "__manual__" ? "__manual__" : Number(v))
            }
            disabled={
              disabled ||
              (employerPerspective && state.clientSelectionKind === "external_party") ||
              platformClientForSites <= 0 ||
              sitesLoading
            }
          >
            <SelectTrigger className="h-11 w-full">
              <SelectValue
                placeholder={sitesLoading ? "Loading sites…" : "Type manually or select a saved site…"}
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__manual__">Type location manually</SelectItem>
              {clientSites.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>
                  {s.name}
                  {s.location ? ` — ${s.location}` : ""}
                  {s.clientName ? ` (${s.clientName})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>
              Location (English) <span className="text-destructive">*</span>
            </Label>
            <Input
              className="h-11"
              placeholder="e.g. eXtra — Muscat City Centre"
              value={state.locationEn}
              onChange={(e) => set("locationEn", e.target.value)}
              disabled={disabled}
            />
          </div>
          <div className="space-y-2">
            <Label>
              Location (Arabic) <span className="text-destructive">*</span>
            </Label>
            <Input
              className="h-11"
              dir="rtl"
              placeholder="مثال: اكسترا — مسقط سيتي سنتر"
              value={state.locationAr}
              onChange={(e) => set("locationAr", e.target.value)}
              disabled={disabled}
            />
          </div>
        </div>
      </section>

      <Separator />

      {/* ── 3. Promoter Employee + Identity ───────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Users className="h-4 w-4 text-primary" />
          Promoter employee
          <span className="text-xs font-normal text-muted-foreground ml-1">— must belong to second party</span>
        </div>

        {employeesError && (
          <Alert variant="destructive" className="py-2">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex flex-wrap items-center gap-2 text-xs">
              <span>{employeesErrorObj?.message ?? "Could not load employees."}</span>
              <Button type="button" variant="outline" size="sm" onClick={() => refetchEmployees()}>
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <Select
          value={state.promoterEmployeeId === "" ? "" : String(state.promoterEmployeeId)}
          onValueChange={(v) => onSelectEmployee(Number(v))}
          disabled={
            disabled ||
            !employerEmployeesEnabled ||
            employeesLoading ||
            employeesError
          }
        >
          <SelectTrigger className="h-11 w-full">
            <SelectValue
              placeholder={
                employerPerspective
                  ? state.clientSelectionKind === ""
                    ? "Select a client first…"
                    : typeof state.employerCompanyId !== "number" || state.employerCompanyId <= 0
                      ? "Set employer context…"
                      : employeesLoading
                        ? "Loading employees…"
                        : employeesError
                          ? "Employee list unavailable"
                          : "Select promoter employee…"
                  : typeof state.clientCompanyId !== "number" || state.clientCompanyId <= 0
                    ? "Select client (first party) first…"
                    : typeof state.employerCompanyId !== "number" || state.employerCompanyId <= 0
                      ? "Select employer (second party) first…"
                      : employeesLoading
                        ? "Loading employees…"
                        : employeesError
                          ? "Employee list unavailable"
                          : "Select promoter employee…"
              }
            />
          </SelectTrigger>
          <SelectContent>
            {employerEmployees.map((e) => (
              <SelectItem key={e.id} value={String(e.id)}>
                {e.firstName} {e.lastName}
                {e.status === "on_leave" ? " (on leave)" : ""}
                {e.firstNameAr || e.lastNameAr
                  ? ` · ${[e.firstNameAr, e.lastNameAr].filter(Boolean).join(" ")}`
                  : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {employerEmployeesEnabled &&
          !employeesLoading &&
          !employeesError &&
          employerEmployees.length === 0 && (
            <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-md px-3 py-2">
              No active or on-leave employees found for this employer. Add employees under the employer
              company first.
            </p>
          )}

        {/* Identity fields */}
        <div className="pt-1">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            <Shield className="h-3.5 w-3.5" />
            Identity &amp; compliance
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Civil ID / National ID</Label>
              <Input
                className="h-11 font-mono text-sm"
                placeholder="e.g. 99012345678"
                value={state.civilId}
                onChange={(e) => set("civilId", e.target.value)}
                disabled={disabled}
              />
            </div>
            <div className="space-y-2">
              <Label>Passport number</Label>
              <Input
                className="h-11 font-mono text-sm"
                placeholder="e.g. OM12345678"
                value={state.passportNumber}
                onChange={(e) => set("passportNumber", e.target.value)}
                disabled={disabled}
              />
            </div>
            <div className="space-y-2">
              <Label>Passport expiry</Label>
              <DateInput
                className="h-11"
                value={state.passportExpiry}
                onChange={(e) => set("passportExpiry", e.target.value)}
                disabled={disabled}
              />
            </div>
            <div className="space-y-2">
              <Label>Nationality</Label>
              <Input
                className="h-11"
                placeholder="e.g. Omani"
                value={state.nationality}
                onChange={(e) => set("nationality", e.target.value)}
                disabled={disabled}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Job title (English)</Label>
              <Input
                className="h-11"
                placeholder="e.g. Promoter / Sales Representative"
                value={state.jobTitleEn}
                onChange={(e) => set("jobTitleEn", e.target.value)}
                disabled={disabled}
              />
            </div>
          </div>
        </div>
      </section>

      <Separator />

      {/* ── 4. Contract Details ───────────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>
              Effective date (start) <span className="text-destructive">*</span>
            </Label>
            <DateInput
              className="h-11"
              value={state.effectiveDate}
              onChange={(e) => set("effectiveDate", e.target.value)}
              disabled={disabled}
            />
          </div>
          <div className="space-y-2">
            <Label>
              Expiry date (end) <span className="text-destructive">*</span>
            </Label>
            <DateInput
              className="h-11"
              value={state.expiryDate}
              onChange={(e) => set("expiryDate", e.target.value)}
              disabled={disabled}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Contract reference no.</Label>
            <Input
              className="h-11 font-mono text-sm"
              placeholder="e.g. PA-2026-001"
              value={state.contractNumber}
              onChange={(e) => set("contractNumber", e.target.value)}
              disabled={disabled}
            />
          </div>
          <div className="space-y-2">
            <Label>Issue date</Label>
            <DateInput
              className="h-11"
              value={state.issueDate}
              onChange={(e) => set("issueDate", e.target.value)}
              disabled={disabled}
            />
          </div>
        </div>

        {showStatus && (
          <div className="space-y-2 max-w-xs">
            <Label>Status</Label>
            <Select
              value={state.status}
              onValueChange={(v) =>
                set("status", v as "active" | "inactive" | "expired")
              }
              disabled={disabled}
            >
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive / Draft</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </section>
    </div>
  );
}
