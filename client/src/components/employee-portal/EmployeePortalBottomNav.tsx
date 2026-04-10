import React from "react";
import { LayoutDashboard, UserCheck, CheckSquare, ArrowLeftRight, User } from "lucide-react";
import { cn } from "@/lib/utils";

const PRIMARY_TABS = new Set(["overview", "attendance", "tasks", "requests", "profile"]);

/** Secondary routes (documents, leave, payroll, etc.) map to Profile for nav highlight */
export function bottomNavHighlightTab(activeTab: string): string {
  if (PRIMARY_TABS.has(activeTab)) return activeTab;
  return "profile";
}

export interface EmployeePortalBottomNavProps {
  activeTab: string;
  onNavigate: (tab: string) => void;
  taskBadge?: number;
  requestBadge?: number;
  className?: string;
}

const NAV_ITEMS = [
  /** Tab label is employee-friendly; overview content is branded "Command center" in-page. */
  { value: "overview", label: "Today", Icon: LayoutDashboard },
  { value: "attendance", label: "Attendance", Icon: UserCheck },
  { value: "tasks", label: "Tasks", Icon: CheckSquare },
  { value: "requests", label: "Requests", Icon: ArrowLeftRight },
  { value: "profile", label: "Profile", Icon: User },
] as const;

/**
 * Fixed bottom bar — thumb-friendly (≥44px touch targets), safe-area aware.
 */
export function EmployeePortalBottomNav({
  activeTab,
  onNavigate,
  taskBadge = 0,
  requestBadge = 0,
  className,
}: EmployeePortalBottomNavProps) {
  const highlight = bottomNavHighlightTab(activeTab);

  return (
    <nav
      className={cn(
        "fixed bottom-0 left-0 right-0 z-50 border-t border-border/80 bg-card/95 backdrop-blur-md supports-[backdrop-filter]:bg-card/90",
        "pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1 shadow-[0_-4px_24px_-8px_rgba(0,0,0,0.12)]",
        className,
      )}
      aria-label="Main navigation — Today is your command center"
    >
      <div className="mx-auto flex max-w-lg items-stretch justify-around gap-0 px-1">
        {NAV_ITEMS.map(({ value, label, Icon }) => {
          const isActive = highlight === value;
          const badge =
            value === "tasks" ? taskBadge : value === "requests" ? requestBadge : 0;
          return (
            <button
              key={value}
              type="button"
              onClick={() => onNavigate(value)}
              className={cn(
                "relative flex min-h-[3.25rem] min-w-[3.25rem] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5",
                "touch-manipulation transition-colors active:scale-[0.98]",
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="relative">
                <Icon className={cn("h-6 w-6", isActive && "stroke-[2.5px]")} aria-hidden />
                {badge > 0 && (
                  <span className="absolute -right-2 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground">
                    {badge > 9 ? "9+" : badge}
                  </span>
                )}
              </span>
              <span className="max-w-full truncate text-[10px] font-semibold leading-none">{label}</span>
              {isActive && (
                <span className="absolute bottom-1 left-1/2 h-1 w-8 -translate-x-1/2 rounded-full bg-primary" aria-hidden />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
