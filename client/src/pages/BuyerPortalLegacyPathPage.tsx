import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { isBuyerPortalUiEnabled } from "@/lib/buyerPortalEnv";
import { useEffect } from "react";
import { useLocation } from "wouter";

/**
 * `/buyer-portal` is a friendly alias for docs and bookmarks; canonical routes are `/buyer` and `/buyer/invoices`.
 */
export default function BuyerPortalLegacyPathPage() {
  const [loc, navigate] = useLocation();

  useEffect(() => {
    if (!isBuyerPortalUiEnabled()) return;
    const [path, query] = loc.split("?");
    const suffix = query ? `?${query}` : "";
    const invoices =
      path === "/buyer-portal/invoices" || path.startsWith("/buyer-portal/invoices/");
    navigate(`${invoices ? "/buyer/invoices" : "/buyer"}${suffix}`, { replace: true });
  }, [loc, navigate]);

  if (isBuyerPortalUiEnabled()) {
    return null;
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <Card className="w-full max-w-lg shadow-lg border-0 bg-white/80 backdrop-blur-sm">
        <CardContent className="pt-8 pb-8 text-center space-y-4">
          <h1 className="text-xl font-semibold text-slate-900">Buyer Portal</h1>
          <p className="text-slate-600 text-sm leading-relaxed">
            This preview URL is supported, but the Buyer Portal UI is turned off. Set{" "}
            <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">VITE_BUYER_PORTAL_ENABLED=true</code>{" "}
            (and <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">BUYER_PORTAL_ENABLED=true</code> on the
            server) for a working scaffold. Canonical path when enabled:{" "}
            <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">/buyer</code>.
          </p>
          <Button onClick={() => navigate("/dashboard")}>Back to dashboard</Button>
        </CardContent>
      </Card>
    </div>
  );
}
