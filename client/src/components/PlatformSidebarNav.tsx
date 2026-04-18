import { ChevronDown, ChevronRight } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import {
  type NavGroupDef,
  type NavItemDef,
  type NavLeafDef,
  type NavBranchDef,
  type NavTier,
  isNavLeafActive,
  branchShouldShowOpen,
  groupContainsActiveRoute,
} from "@/config/platformNav";
import type { SidebarBadgeMap } from "@/lib/sidebarBadgeResolver";

const NAV_GROUP_OPEN_STORAGE_KEY = "smartpro-nav-group-open";

function readStoredGroupOpen(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(NAV_GROUP_OPEN_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed == null || typeof parsed !== "object") return {};
    return parsed as Record<string, boolean>;
  } catch {
    return {};
  }
}

function writeStoredGroupOpen(next: Record<string, boolean>): void {
  try {
    sessionStorage.setItem(NAV_GROUP_OPEN_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
}

function tierHeaderClass(tier: NavTier | undefined): string {
  switch (tier ?? "primary") {
    case "primary":
      return "text-white/52 font-semibold tracking-[0.14em]";
    case "secondary":
      return "text-white/40 font-semibold tracking-[0.14em]";
    case "tertiary":
      return "text-white/32 font-medium tracking-[0.12em]";
    default:
      return "text-white/52 font-semibold tracking-[0.14em]";
  }
}

function NavLeafLink({
  item,
  location,
  onClose,
  t,
  pendingProfileReq,
  badgeValues,
  navGroups,
}: {
  item: NavLeafDef;
  location: string;
  onClose?: () => void;
  t: (key: string, defaultLabel: string) => string;
  pendingProfileReq: number;
  badgeValues: SidebarBadgeMap;
  navGroups: NavGroupDef[];
}) {
  const active = isNavLeafActive(item, location, navGroups);
  const Icon = item.icon;
  const navBadge = item.badgeMeta ? badgeValues[item.badgeMeta.key] : undefined;
  const badgeToneClass =
    navBadge?.tone === "critical"
      ? "sidebar-nav-badge--critical"
      : navBadge?.tone === "warning"
        ? "sidebar-nav-badge--warning"
        : "sidebar-nav-badge--neutral";
  return (
    <Link
      href={item.href}
      onClick={onClose}
      data-nav-intent={item.intent}
      data-hub-primary={item.hubPrimary ? "true" : undefined}
      className={cn(
        "sidebar-nav-item sidebar-nav-item--child",
        item.hubPrimary && "sidebar-nav-item--hub",
        active && "active",
      )}
    >
      <Icon size={16} className="shrink-0 opacity-90" aria-hidden />
      <span className="flex-1 min-w-0 text-[13px] leading-snug text-start">{t(item.labelKey, item.defaultLabel)}</span>
      {navBadge ? (
        <Badge
          variant="secondary"
          className={cn(
            "sidebar-nav-badge text-[10px] px-1.5 py-0 h-5 min-w-[1.25rem] justify-center shrink-0 border",
            badgeToneClass,
          )}
          aria-label={`${navBadge.count} items`}
        >
          {navBadge.label}
        </Badge>
      ) : item.href === "/workforce/profile-change-requests" && pendingProfileReq > 0 ? (
        <Badge
          variant="secondary"
          className="text-[10px] px-1.5 py-0 h-5 min-w-[1.25rem] justify-center shrink-0 bg-white/15 text-white border-white/20"
        >
          {pendingProfileReq > 99 ? "99+" : pendingProfileReq}
        </Badge>
      ) : null}
      {active ? (
        <ChevronRight size={14} className="sidebar-nav-chevron-forward opacity-55 shrink-0" aria-hidden />
      ) : null}
    </Link>
  );
}

function NavBranch({
  item,
  location,
  onClose,
  t,
  pendingProfileReq,
  badgeValues,
  navGroups,
}: {
  item: NavBranchDef;
  location: string;
  onClose?: () => void;
  t: (key: string, defaultLabel: string) => string;
  pendingProfileReq: number;
  badgeValues: SidebarBadgeMap;
  navGroups: NavGroupDef[];
}) {
  const pathActive = branchShouldShowOpen(item, location, navGroups);
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
        aria-expanded={open}
        className={cn(
          "sidebar-nav-item w-full text-start sidebar-nav-branch-trigger",
          pathActive && "sidebar-nav-branch-trigger--active",
        )}
      >
        <Icon size={18} className="shrink-0 opacity-90" aria-hidden />
        <span className="flex-1 min-w-0 text-[13px] leading-snug text-start">{t(item.labelKey, item.defaultLabel)}</span>
        <ChevronDown
          size={14}
          className={cn("shrink-0 opacity-50 transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="sidebar-nav-branch-nested space-y-0.5 pt-0.5">
        {item.children.map((child) => (
          <NavLeafLink
            key={child.id}
            item={child}
            location={location}
            onClose={onClose}
            t={t}
            pendingProfileReq={pendingProfileReq}
            badgeValues={badgeValues}
            navGroups={navGroups}
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
  badgeValues,
  navGroups,
}: {
  item: NavItemDef;
  location: string;
  onClose?: () => void;
  t: (key: string, defaultLabel: string) => string;
  pendingProfileReq: number;
  badgeValues: SidebarBadgeMap;
  navGroups: NavGroupDef[];
}) {
  if (item.kind === "branch") {
    return (
      <NavBranch
        item={item}
        location={location}
        onClose={onClose}
        t={t}
        pendingProfileReq={pendingProfileReq}
        badgeValues={badgeValues}
        navGroups={navGroups}
      />
    );
  }
  const Icon = item.icon;
  const active = isNavLeafActive(item, location, navGroups);
  const navBadge = item.badgeMeta ? badgeValues[item.badgeMeta.key] : undefined;
  const badgeToneClass =
    navBadge?.tone === "critical"
      ? "sidebar-nav-badge--critical"
      : navBadge?.tone === "warning"
        ? "sidebar-nav-badge--warning"
        : "sidebar-nav-badge--neutral";
  return (
    <Link
      href={item.href}
      onClick={onClose}
      data-nav-intent={item.intent}
      data-hub-primary={item.hubPrimary ? "true" : undefined}
      className={cn("sidebar-nav-item", item.hubPrimary && "sidebar-nav-item--hub", active && "active")}
    >
      <Icon size={18} aria-hidden />
      <span className="flex-1 min-w-0 text-[13px] leading-snug text-start">{t(item.labelKey, item.defaultLabel)}</span>
      {navBadge ? (
        <Badge
          variant="secondary"
          className={cn(
            "sidebar-nav-badge text-[10px] px-1.5 py-0 h-5 min-w-[1.25rem] justify-center shrink-0 border",
            badgeToneClass,
          )}
          aria-label={`${navBadge.count} items`}
        >
          {navBadge.label}
        </Badge>
      ) : item.href === "/workforce/profile-change-requests" && pendingProfileReq > 0 ? (
        <Badge
          variant="secondary"
          className="text-[10px] px-1.5 py-0 h-5 min-w-[1.25rem] justify-center shrink-0 bg-white/15 text-white border-white/20"
        >
          {pendingProfileReq > 99 ? "99+" : pendingProfileReq}
        </Badge>
      ) : null}
      {active ? (
        <ChevronRight size={14} className="sidebar-nav-chevron-forward opacity-55 shrink-0" aria-hidden />
      ) : null}
    </Link>
  );
}

export function PlatformSidebarNav({
  groups,
  onClose,
  t,
  platformNav,
  pendingProfileReq,
  badgeValues = {},
}: {
  groups: NavGroupDef[];
  onClose?: () => void;
  t: (key: string, defaultLabel: string) => string;
  platformNav: boolean;
  pendingProfileReq: number;
  badgeValues?: SidebarBadgeMap;
}) {
  const [location] = useLocation();
  const [groupOpenOverride, setGroupOpenOverride] = useState<Record<string, boolean>>(() => readStoredGroupOpen());

  const resolveGroupOpen = useCallback(
    (group: NavGroupDef): boolean => {
      const active = groupContainsActiveRoute(group, location, groups);
      if (active) return true;
      if (!group.collapsible) return true;
      const o = groupOpenOverride[group.id];
      if (o !== undefined) return o;
      return !group.defaultCollapsed;
    },
    [groupOpenOverride, location, groups],
  );

  const setGroupOpen = useCallback((group: NavGroupDef, nextOpen: boolean) => {
    if (groupContainsActiveRoute(group, location, groups)) return;
    setGroupOpenOverride((prev) => {
      const n = { ...prev, [group.id]: nextOpen };
      writeStoredGroupOpen(n);
      return n;
    });
  }, [location, groups]);

  return (
    <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-7" aria-label="Primary">
      {groups.map((group, index) => {
        const tier = group.tier ?? "primary";
        const title =
          group.id === "platform" && !platformNav
            ? t("yourCompanyShell", "Your company")
            : t(group.labelKey, group.defaultGroupLabel);
        const isFirstTertiary = tier === "tertiary" && (groups[index - 1]?.tier ?? "primary") !== "tertiary";
        const collapsible = Boolean(group.collapsible);
        const open = resolveGroupOpen(group);

        const headerClass = cn(
          "px-3 mb-2 text-[10px] font-semibold uppercase tracking-widest",
          tierHeaderClass(tier),
        );

        const itemsBlock = (
          <div className="space-y-0.5">
            {group.items.map((item) => (
              <NavItemRow
                key={item.id}
                item={item}
                location={location}
                onClose={onClose}
                t={t}
                pendingProfileReq={pendingProfileReq}
                badgeValues={badgeValues}
                navGroups={groups}
              />
            ))}
          </div>
        );

        return (
          <div
            key={group.id}
            data-nav-tier={tier}
            className={cn(isFirstTertiary && "pt-5 mt-1 border-t border-white/8")}
          >
            {!collapsible ? (
              <>
                <div className={headerClass}>{title}</div>
                {itemsBlock}
              </>
            ) : (
              <Collapsible
                open={open}
                onOpenChange={(next) => setGroupOpen(group, next)}
                className="space-y-0"
              >
                <CollapsibleTrigger
                  type="button"
                  aria-expanded={open}
                  className={cn(
                    "w-full flex items-center gap-2 px-2 py-1 rounded-md text-start transition-colors",
                    "hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--smartpro-orange)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--sidebar)]",
                    tier === "tertiary" && "opacity-95",
                  )}
                >
                  <span className={cn(headerClass, "mb-0 flex-1 text-start px-1 min-w-0 break-words")}>{title}</span>
                  <ChevronDown
                    size={14}
                    className={cn(
                      "shrink-0 opacity-45 text-white/50 transition-transform",
                      open && "rotate-180",
                    )}
                    aria-hidden
                  />
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-1 data-[state=closed]:animate-none">
                  {itemsBlock}
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>
        );
      })}
    </nav>
  );
}
