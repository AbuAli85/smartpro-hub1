import { ChevronDown, ChevronRight } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  type NavGroupDef,
  type NavItemDef,
  type NavLeafDef,
  type NavBranchDef,
  isNavLeafActive,
  branchShouldShowOpen,
} from "@/config/platformNav";

function NavLeafLink({
  item,
  location,
  onClose,
  t,
  pendingProfileReq,
}: {
  item: NavLeafDef;
  location: string;
  onClose?: () => void;
  t: (key: string, defaultLabel: string) => string;
  pendingProfileReq: number;
}) {
  const active = isNavLeafActive(item, location);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onClose}
      data-nav-intent={item.intent}
      data-hub-primary={item.hubPrimary ? "true" : undefined}
      className={`sidebar-nav-item sidebar-nav-item--child ${item.hubPrimary ? "sidebar-nav-item--hub" : ""} ${active ? "active" : ""}`}
    >
      <Icon size={16} className="shrink-0 opacity-90" aria-hidden />
      <span className="flex-1 text-[13px]">{t(item.labelKey, item.defaultLabel)}</span>
      {item.href === "/workforce/profile-change-requests" && pendingProfileReq > 0 ? (
        <Badge
          variant="secondary"
          className="text-[10px] px-1.5 py-0 h-5 min-w-[1.25rem] justify-center shrink-0 bg-white/15 text-white border-white/20"
        >
          {pendingProfileReq > 99 ? "99+" : pendingProfileReq}
        </Badge>
      ) : null}
      {active ? <ChevronRight size={14} className="opacity-60 shrink-0" aria-hidden /> : null}
    </Link>
  );
}

function NavBranch({
  item,
  location,
  onClose,
  t,
  pendingProfileReq,
}: {
  item: NavBranchDef;
  location: string;
  onClose?: () => void;
  t: (key: string, defaultLabel: string) => string;
  pendingProfileReq: number;
}) {
  const pathActive = branchShouldShowOpen(item, location);
  const [peekOpen, setPeekOpen] = useState(false);

  useEffect(() => {
    if (!pathActive) setPeekOpen(false);
  }, [location, pathActive]);

  const open = pathActive || peekOpen;
  const Icon = item.icon;

  return (
    <Collapsible
      open={open}
      onOpenChange={(next) => {
        if (pathActive) return;
        setPeekOpen(next);
      }}
      className="space-y-0.5"
    >
      <CollapsibleTrigger
        type="button"
        data-nav-intent={item.intent}
        className={`sidebar-nav-item w-full text-left ${pathActive ? "bg-white/8 ring-1 ring-white/10" : ""}`}
      >
        <Icon size={18} className="shrink-0 opacity-90" aria-hidden />
        <span className="flex-1">{t(item.labelKey, item.defaultLabel)}</span>
        <ChevronDown
          size={14}
          className={`shrink-0 opacity-50 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-0.5 pt-0.5 pl-2 border-l border-white/10 ml-3">
        {item.children.map((child) => (
          <NavLeafLink
            key={child.id}
            item={child}
            location={location}
            onClose={onClose}
            t={t}
            pendingProfileReq={pendingProfileReq}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

function NavItemRow({
  item,
  location,
  onClose,
  t,
  pendingProfileReq,
}: {
  item: NavItemDef;
  location: string;
  onClose?: () => void;
  t: (key: string, defaultLabel: string) => string;
  pendingProfileReq: number;
}) {
  if (item.kind === "branch") {
    return (
      <NavBranch
        item={item}
        location={location}
        onClose={onClose}
        t={t}
        pendingProfileReq={pendingProfileReq}
      />
    );
  }
  const Icon = item.icon;
  const active = isNavLeafActive(item, location);
  return (
    <Link
      href={item.href}
      onClick={onClose}
      data-nav-intent={item.intent}
      data-hub-primary={item.hubPrimary ? "true" : undefined}
      className={`sidebar-nav-item ${item.hubPrimary ? "sidebar-nav-item--hub" : ""} ${active ? "active" : ""}`}
    >
      <Icon size={18} aria-hidden />
      <span className="flex-1">{t(item.labelKey, item.defaultLabel)}</span>
      {item.href === "/workforce/profile-change-requests" && pendingProfileReq > 0 ? (
        <Badge
          variant="secondary"
          className="text-[10px] px-1.5 py-0 h-5 min-w-[1.25rem] justify-center shrink-0 bg-white/15 text-white border-white/20"
        >
          {pendingProfileReq > 99 ? "99+" : pendingProfileReq}
        </Badge>
      ) : null}
      {active ? <ChevronRight size={14} className="opacity-60 shrink-0" aria-hidden /> : null}
    </Link>
  );
}

export function PlatformSidebarNav({
  groups,
  onClose,
  t,
  platformNav,
  pendingProfileReq,
}: {
  groups: NavGroupDef[];
  onClose?: () => void;
  t: (key: string, defaultLabel: string) => string;
  platformNav: boolean;
  pendingProfileReq: number;
}) {
  const [location] = useLocation();

  return (
    <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5" aria-label="Primary">
      {groups.map((group) => {
        const title =
          group.id === "platform" && !platformNav
            ? t("yourCompanyShell", "Your company")
            : t(group.labelKey, group.defaultGroupLabel);
        return (
          <div key={group.id}>
            <div className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/30">
              {title}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavItemRow
                  key={item.id}
                  item={item}
                  location={location}
                  onClose={onClose}
                  t={t}
                  pendingProfileReq={pendingProfileReq}
                />
              ))}
            </div>
          </div>
        );
      })}
    </nav>
  );
}
