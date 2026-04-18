import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { LayoutDashboard, Layers, Menu, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CLIENT_PORTAL_MOBILE_OVERFLOW_ITEMS,
  isClientPortalMobileMoreTabActive,
  isClientPortalMobilePrimaryTabActive,
} from "@/lib/clientPortalMobileNav";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

/**
 * Client portal only: 4 bottom tabs (Home, Services, Messages, More) + bottom sheet for overflow links.
 * Desktop portal sidebar is unchanged elsewhere (`CLIENT_PORTAL_SHELL_GROUP_DEFS`).
 */
export function ClientPortalMobileBottomNav() {
  const [location] = useLocation();
  const { t } = useTranslation("nav");
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    setMoreOpen(false);
  }, [location]);

  const moreActive = isClientPortalMobileMoreTabActive(location);

  const primaries = [
    { href: "/client" as const, icon: LayoutDashboard, label: t("clientPortalMobileHome", "Home") },
    { href: "/client/engagements" as const, icon: Layers, label: t("clientPortalMobileServices", "Services") },
    { href: "/client/messages" as const, icon: MessageSquare, label: t("clientPortalMobileMessages", "Messages") },
  ];

  return (
    <>
      <nav
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-card border-t border-border flex items-stretch justify-around min-h-16 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1"
        aria-label={t("clientPortalMobileNavLabel", "Client portal")}
      >
        {primaries.map(({ href, icon: Icon, label }) => {
          const active = isClientPortalMobilePrimaryTabActive(href, location);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-0.5 px-2 py-2 rounded-lg transition-colors min-w-0",
                active ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
              aria-current={active ? "page" : undefined}
            >
              <Icon size={22} className="shrink-0" aria-hidden />
              <span className="text-[10px] font-medium leading-tight text-center">{label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className={cn(
            "flex flex-1 flex-col items-center justify-center gap-0.5 px-2 py-2 rounded-lg transition-colors min-w-0",
            moreActive ? "text-primary" : "text-muted-foreground hover:text-foreground",
          )}
          aria-expanded={moreOpen}
          aria-controls="client-portal-more-sheet"
          aria-current={moreActive ? "page" : undefined}
        >
          <Menu size={22} className="shrink-0" aria-hidden />
          <span className="text-[10px] font-medium leading-tight text-center">
            {t("clientPortalMobileMore", "More")}
          </span>
        </button>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent
          id="client-portal-more-sheet"
          side="bottom"
          className="rounded-t-2xl max-h-[min(85vh,32rem)] flex flex-col p-0 gap-0"
        >
          <SheetHeader className="px-4 pt-6 pb-2 text-start border-b border-border shrink-0">
            <SheetTitle>{t("clientPortalMoreSheetTitle", "More")}</SheetTitle>
            <SheetDescription className="sr-only">
              {t("clientPortalMoreSheetDescription", "Documents, billing, team, and settings")}
            </SheetDescription>
          </SheetHeader>
          <div className="flex flex-col overflow-y-auto py-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {CLIENT_PORTAL_MOBILE_OVERFLOW_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMoreOpen(false)}
                className="flex items-center gap-3 px-4 py-3.5 text-base font-medium text-foreground hover:bg-muted/80 active:bg-muted transition-colors"
              >
                {t(item.labelKey, item.defaultLabel)}
              </Link>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
