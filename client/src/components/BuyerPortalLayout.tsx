import type { ReactNode } from "react";
import { Link } from "wouter";

/**
 * Minimal shell for Buyer Portal — intentionally not using PlatformLayout / company sidebar.
 */
export default function BuyerPortalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b bg-card px-4 py-3 flex items-center justify-between gap-3">
        <div className="font-bold text-sm tracking-tight">Buyer Portal</div>
        <Link href="/dashboard" className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline">
          Back to app
        </Link>
      </header>
      <main className="flex-1 p-4 md:p-6 max-w-3xl mx-auto w-full">{children}</main>
    </div>
  );
}
