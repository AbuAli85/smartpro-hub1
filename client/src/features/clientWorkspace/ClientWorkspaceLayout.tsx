import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Layers, FolderOpen, Receipt, MessageSquare, Settings, Users } from "lucide-react";
import { useTranslation } from "react-i18next";

const NAV = [
  { href: "/client", key: "dashboard", icon: LayoutDashboard },
  { href: "/client/engagements", key: "engagements", icon: Layers },
  { href: "/client/documents", key: "documents", icon: FolderOpen },
  { href: "/client/invoices", key: "invoices", icon: Receipt },
  { href: "/client/messages", key: "messages", icon: MessageSquare },
  { href: "/client/team", key: "team", icon: Users },
  { href: "/preferences", key: "settings", icon: Settings },
] as const;

export function ClientWorkspaceLayout({ children }: { children: ReactNode }) {
  const [loc] = useLocation();
  const { t } = useTranslation("engagements");

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background">
      <aside className="w-full md:w-56 border-b md:border-b-0 md:border-r border-border shrink-0 md:min-h-screen p-3 md:sticky md:top-0 md:self-start">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-2 mb-2">
          {t("clientWorkspace.shellAsideLabel")}
        </p>
        <nav className="flex md:flex-col gap-1 overflow-x-auto pb-1 md:pb-0">
          {NAV.map(({ href, key, icon: Icon }) => {
            const active = loc === href || (href !== "/client" && loc.startsWith(href + "/"));
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm whitespace-nowrap transition-colors",
                  active ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {t(`clientWorkspace.nav.${key}`)}
              </Link>
            );
          })}
        </nav>
      </aside>
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
