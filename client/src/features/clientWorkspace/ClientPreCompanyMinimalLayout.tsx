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
 * Outer chrome for `/client` (see {@link AppRoutes}): minimal header + {@link ClientAccessGate} + children.
 * Never combined with {@link PlatformLayout} — {@link ClientWorkspaceLayout} supplies in-workspace navigation.
 * Supports RTL layout when the active locale is `ar-OM`.
 */
export function ClientPreCompanyMinimalLayout({ children }: Props) {
  const { user, logout } = useAuth();
  const { t, i18n } = useTranslation("engagements");
  const isRtl = i18n.language === "ar-OM";

  return (
    <div className="min-h-screen flex flex-col bg-background" dir={isRtl ? "rtl" : "ltr"}>
      <a href="#main-content" className="skip-to-main">
        {isRtl ? "انتقل إلى المحتوى الرئيسي" : "Skip to main content"}
      </a>
      <header
        className="h-14 shrink-0 border-b border-border bg-card flex items-center justify-between px-4 gap-3"
        role="banner"
      >
        {/* Brand — always on the leading edge (left in LTR, right in RTL) */}
        <Link href="/client" className="flex items-center gap-2 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-[var(--smartpro-orange)] flex items-center justify-center shrink-0">
            <span className="text-white font-bold text-sm">SP</span>
          </div>
          <div className={`min-w-0 ${isRtl ? "text-right" : "text-left"}`}>
            <p className="text-sm font-semibold leading-tight truncate">SmartPRO</p>
            <p className="text-[10px] text-muted-foreground truncate">{t("clientWorkspace.shellAsideLabel")}</p>
          </div>
        </Link>

        {/* Controls — always on the trailing edge */}
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
            <DropdownMenuContent align={isRtl ? "start" : "end"} className="w-52">
              <div className="px-2 py-1.5 text-xs text-muted-foreground truncate">{user?.email}</div>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link
                  href="/preferences"
                  className={`flex w-full cursor-pointer items-center gap-2 ${isRtl ? "flex-row-reverse" : ""}`}
                >
                  <Settings size={14} /> {t("clientWorkspace.minimalPreferences")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className={`text-destructive focus:text-destructive ${isRtl ? "flex-row-reverse" : ""}`}
                onSelect={() => {
                  void logout();
                }}
              >
                <LogOut size={14} className={isRtl ? "ml-2" : "mr-2"} />
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
