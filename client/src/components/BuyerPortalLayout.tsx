import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";

/**
 * Minimal shell for Buyer Portal — intentionally not using PlatformLayout / company sidebar.
 */
export default function BuyerPortalLayout({ children }: { children: ReactNode }) {
  const [loc] = useLocation();
  const account = new URLSearchParams(loc.split("?")[1] ?? "").get("account");
  const accountSuffix = account ? `?account=${encodeURIComponent(account)}` : "";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b bg-card px-4 py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="font-bold text-sm tracking-tight">Buyer Portal</div>
        <nav className="flex flex-wrap items-center gap-3 text-xs">
          <Link
            href={`/buyer${accountSuffix}`}
            className="text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
          >
            Overview
          </Link>
          <Link
            href={`/buyer/invoices${accountSuffix}`}
            className="text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
          >
            Invoices
          </Link>
          <Link href="/dashboard" className="text-muted-foreground hover:text-foreground underline-offset-2 hover:underline">
            Back to app
          </Link>
        </nav>
      </header>
      <main className="flex-1 p-4 md:p-6 max-w-4xl mx-auto w-full">{children}</main>
    </div>
  );
}
