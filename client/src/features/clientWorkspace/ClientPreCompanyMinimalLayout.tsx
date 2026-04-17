import type { ReactNode } from "react";
import { Link } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ClientAccessGate } from "@/components/ClientAccessGate";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { LogOut, Settings } from "lucide-react";
import { useTranslation } from "react-i18next";

type Props = { children: ReactNode };

/**
 * Minimal header + main for portal-only users on the client journey:
 * `/client` (with or without a company) and pre-company paths handled by {@link PlatformLayout}.
 * No platform sidebar, control tower, or ops/HR shell — {@link ClientWorkspaceLayout} supplies workspace nav.
 */
export function ClientPreCompanyMinimalLayout({ children }: Props) {
  const { user, logout } = useAuth();
  const { t } = useTranslation("engagements");

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <a href="#main-content" className="skip-to-main">
        Skip to main content
      </a>
      <header
        className="h-14 shrink-0 border-b border-border bg-card flex items-center justify-between px-4 gap-3"
        role="banner"
      >
        <Link href="/client" className="flex items-center gap-2 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-[var(--smartpro-orange)] flex items-center justify-center shrink-0">
            <span className="text-white font-bold text-sm">SP</span>
          </div>
          <div className="min-w-0 text-left">
            <p className="text-sm font-semibold leading-tight truncate">SmartPRO</p>
            <p className="text-[10px] text-muted-foreground truncate">{t("clientWorkspace.shellAsideLabel")}</p>
          </div>
        </Link>
        <div className="flex items-center gap-2 shrink-0">
          <LanguageSwitcher />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2 px-2">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="text-xs">
                    {(user?.name ?? user?.email ?? "?").slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <div className="px-2 py-1.5 text-xs text-muted-foreground truncate">{user?.email}</div>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/preferences" className="flex w-full cursor-pointer items-center gap-2">
                  <Settings size={14} /> {t("clientWorkspace.minimalPreferences")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => {
                  void logout();
                }}
              >
                <LogOut size={14} className="mr-2" />
                {t("clientWorkspace.minimalSignOut")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      <main id="main-content" className="flex-1 min-h-0 overflow-y-auto" role="main">
        <ClientAccessGate>{children}</ClientAccessGate>
      </main>
    </div>
  );
}
