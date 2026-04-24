import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Shield,
  Package,
  Users,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Check,
  X,
} from "lucide-react";
import {
  CAPABILITY_KEYS,
  CAPABILITY_LABELS,
  MODULE_KEYS,
  MODULE_LABELS,
  ROLE_DEFAULT_CAPABILITIES,
  type Capability,
  type CompanyModule,
} from "@shared/capabilities";

// ─── Member capability editor ─────────────────────────────────────────────────

type MemberCapRow = {
  userId: number;
  role: string;
  roleDefaults: string[];
  grants: string[];
  denials: string[];
  effective: string[];
};

function MemberCapabilityRow({
  member,
  companyId,
  onUpdated,
}: {
  member: MemberCapRow;
  companyId: number;
  onUpdated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<Set<Capability>>(new Set(member.effective as Capability[]));

  const updateMutation = trpc.capabilities.updateMemberCapabilities.useMutation({
    onSuccess: () => {
      toast.success("Capabilities updated.");
      setOpen(false);
      onUpdated();
    },
    onError: (e) => toast.error(e.message),
  });

  function toggleCap(cap: Capability) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(cap)) next.delete(cap);
      else next.add(cap);
      return next;
    });
  }

  function save() {
    updateMutation.mutate({
      companyId,
      userId: member.userId,
      effectiveCapabilities: Array.from(selected) as Capability[],
    });
  }

  const hasOverrides = member.grants.length > 0 || member.denials.length > 0;

  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="text-muted-foreground"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
          <div>
            <div className="font-medium text-sm">User #{member.userId}</div>
            <div className="flex items-center gap-2 mt-0.5">
              <Badge variant="outline" className="text-xs">{member.role}</Badge>
              {hasOverrides && (
                <Badge variant="secondary" className="text-xs">custom overrides</Badge>
              )}
            </div>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={() => { setSelected(new Set(member.effective as Capability[])); setOpen(true); }}>
          Edit
        </Button>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t grid grid-cols-2 gap-1 text-xs">
          {CAPABILITY_KEYS.map((cap) => {
            const isEffective = member.effective.includes(cap);
            const isDefault = member.roleDefaults.includes(cap);
            const isGrant = member.grants.includes(cap);
            const isDenial = member.denials.includes(`-${cap}`) || member.denials.includes(cap);
            return (
              <div key={cap} className="flex items-center gap-1.5 text-muted-foreground">
                {isEffective ? (
                  <Check className="h-3 w-3 text-green-500 shrink-0" />
                ) : (
                  <X className="h-3 w-3 text-red-400 shrink-0" />
                )}
                <span className={isEffective ? "text-foreground" : ""}>
                  {CAPABILITY_LABELS[cap]}
                </span>
                {isGrant && !isDefault && <Badge variant="outline" className="text-[10px] py-0">+grant</Badge>}
                {isDenial && <Badge variant="destructive" className="text-[10px] py-0">-denied</Badge>}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Capabilities — User #{member.userId}</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground mb-3">
            Role: <span className="font-medium text-foreground">{member.role}</span>
            {" · "}Checked = effective (role default or explicit grant)
          </div>
          <div className="grid grid-cols-1 gap-2 max-h-80 overflow-y-auto pr-1">
            {CAPABILITY_KEYS.map((cap) => {
              const isDefault = (ROLE_DEFAULT_CAPABILITIES[member.role] ?? []).includes(cap);
              return (
                <label key={cap} className="flex items-center gap-3 cursor-pointer select-none rounded px-2 py-1.5 hover:bg-muted/50">
                  <input
                    type="checkbox"
                    checked={selected.has(cap)}
                    onChange={() => toggleCap(cap)}
                    className="accent-primary"
                  />
                  <span className="flex-1 text-sm">{CAPABILITY_LABELS[cap]}</span>
                  {isDefault && (
                    <span className="text-xs text-muted-foreground">(role default)</span>
                  )}
                </label>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Module toggle ────────────────────────────────────────────────────────────

function ModuleToggleRow({
  module,
  enabled,
  allEnabled,
  onToggle,
  disabled,
}: {
  module: CompanyModule;
  enabled: boolean;
  allEnabled: boolean;
  onToggle: (mod: CompanyModule, checked: boolean) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b last:border-0">
      <div>
        <div className="font-medium text-sm">{MODULE_LABELS[module]}</div>
        {allEnabled && (
          <div className="text-xs text-muted-foreground">All modules enabled (unlimited plan)</div>
        )}
      </div>
      <Switch
        checked={allEnabled || enabled}
        disabled={disabled}
        onCheckedChange={(checked) => onToggle(module, checked)}
      />
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CapabilitiesPage() {
  const { activeCompanyId } = useActiveCompany();
  const companyId = activeCompanyId ?? 0;
  const enabled = companyId > 0;

  const utils = trpc.useUtils();

  const { data: members, isLoading: membersLoading, refetch: refetchMembers } =
    trpc.capabilities.listMemberCapabilities.useQuery({ companyId }, { enabled });

  const { data: modulesData, isLoading: modulesLoading } =
    trpc.capabilities.getCompanyModules.useQuery({ companyId }, { enabled });

  const updateModules = trpc.capabilities.updateCompanyModules.useMutation({
    onSuccess: () => {
      toast.success("Module settings saved.");
      utils.capabilities.getCompanyModules.invalidate({ companyId });
    },
    onError: (e) => toast.error(e.message),
  });

  function handleModuleToggle(mod: CompanyModule, checked: boolean) {
    const current = modulesData?.allModulesEnabled
      ? [...MODULE_KEYS]
      : (modulesData?.enabledModules ?? [...MODULE_KEYS]);
    const next = checked
      ? [...new Set([...current, mod])]
      : current.filter((m) => m !== mod);
    const allOn = MODULE_KEYS.every((k) => next.includes(k));
    updateModules.mutate({ companyId, enabledModules: allOn ? null : (next as CompanyModule[]) });
  }

  if (!enabled) {
    return (
      <div className="p-8 text-center text-muted-foreground">Select a company to manage capabilities.</div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Shield className="h-6 w-6" /> Capabilities & Modules
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Control exactly what each user can see and do. Module toggles restrict entire feature areas;
          per-user overrides adjust individual capabilities within their role.
        </p>
      </div>

      {/* Module configuration */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4" /> Company Modules
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Disabling a module hides its nav items and blocks API access for all users,
            regardless of role.
          </p>
        </CardHeader>
        <CardContent>
          {modulesLoading ? (
            <div className="text-sm text-muted-foreground py-4 text-center">Loading…</div>
          ) : (
            <div>
              {MODULE_KEYS.map((mod) => (
                <ModuleToggleRow
                  key={mod}
                  module={mod}
                  enabled={(modulesData?.enabledModules ?? []).includes(mod)}
                  allEnabled={modulesData?.allModulesEnabled ?? true}
                  onToggle={handleModuleToggle}
                  disabled={updateModules.isPending}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Per-user capabilities */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" /> Member Capabilities
            </CardTitle>
            <Button size="sm" variant="ghost" onClick={() => refetchMembers()} disabled={membersLoading}>
              <RefreshCw className={`h-3.5 w-3.5 ${membersLoading ? "animate-spin" : ""}`} />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Each member starts with their role's default capabilities. You can grant extra capabilities
            or remove defaults individually.
          </p>
        </CardHeader>
        <CardContent>
          {membersLoading ? (
            <div className="text-sm text-muted-foreground py-6 text-center">Loading members…</div>
          ) : !members?.length ? (
            <div className="text-sm text-muted-foreground py-6 text-center">No active members found.</div>
          ) : (
            <div className="space-y-3">
              {members.map((m) => (
                <MemberCapabilityRow
                  key={m.userId}
                  member={m}
                  companyId={companyId}
                  onUpdated={() => refetchMembers()}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Role defaults reference */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4" /> Role Default Capabilities
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Default capability set for each role. Overrides are additions or removals on top of these.
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Object.entries(ROLE_DEFAULT_CAPABILITIES).map(([role, caps]) => (
              <div key={role}>
                <div className="text-sm font-medium mb-1.5">{role}</div>
                <div className="flex flex-wrap gap-1.5">
                  {caps.length === 0 ? (
                    <span className="text-xs text-muted-foreground italic">no default capabilities</span>
                  ) : (
                    (caps as Capability[]).map((cap) => (
                      <Badge key={cap} variant="secondary" className="text-xs">
                        {CAPABILITY_LABELS[cap]}
                      </Badge>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
