import { Button } from "@/components/ui/button";
import { useBuyerPortalAccountSelection } from "@/hooks/useBuyerPortalAccountSelection";
import { trpc } from "@/lib/trpc";
import { useLocation, Link } from "wouter";

/**
 * Foundation placeholder — uses `?account=` when needed; auto-selects when the user has exactly one buyer membership.
 */
export default function BuyerPortalPlaceholderPage() {
  const [location] = useLocation();
  const q = new URLSearchParams(location.split("?")[1] ?? "");
  const raw = q.get("account");
  const customerAccountId = raw != null && raw !== "" ? Number(raw) : NaN;
  const validId = Number.isInteger(customerAccountId) && customerAccountId > 0;

  const accounts = useBuyerPortalAccountSelection(validId, "/buyer");

  const overview = trpc.buyerPortal.getOverview.useQuery(
    { customerAccountId },
    { enabled: validId, retry: false },
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold">Buyer Portal (foundation)</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Choose a buyer account below, or open a direct link with{" "}
          <code className="text-xs bg-muted px-1 rounded">?account=&lt;customerAccountId&gt;</code>.
        </p>
      </div>
      {!validId && accounts.isLoading && (
        <p className="text-sm text-muted-foreground">Loading your buyer accounts…</p>
      )}
      {!validId && accounts.isError && (
        <p className="text-sm text-destructive">{accounts.error.message}</p>
      )}
      {!validId && accounts.isSuccess && accounts.data.length === 0 && (
        <div className="text-sm space-y-2 rounded-md border border-dashed p-4 text-muted-foreground">
          <p>You are not a member of any active buyer account yet.</p>
          <p className="text-xs">
            For development, you can still append{" "}
            <code className="rounded bg-muted px-1">?account=&lt;id&gt;</code> if you have a valid membership for that id.
          </p>
        </div>
      )}
      {!validId && accounts.isSuccess && accounts.data.length > 1 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Select a buyer account</p>
          <ul className="flex flex-col gap-2">
            {accounts.data.map((a) => (
              <li key={a.customerAccountId}>
                <Button variant="outline" size="sm" className="justify-start h-auto py-2 w-full sm:w-auto" asChild>
                  <Link href={`/buyer?account=${a.customerAccountId}`}>
                    <span className="text-left">
                      <span className="font-medium block">{a.displayName}</span>
                      <span className="text-xs text-muted-foreground font-normal">
                        Account #{a.customerAccountId} · {a.role}
                      </span>
                    </span>
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {validId && overview.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {validId && overview.isError && (
        <p className="text-sm text-destructive">{overview.error.message}</p>
      )}
      {validId && overview.data && (
        <>
          <p className="text-sm">
            <Link href={`/buyer/invoices?account=${customerAccountId}`} className="text-primary font-medium hover:underline">
              View invoices →
            </Link>
          </p>
          <pre className="text-xs bg-muted p-3 rounded-md overflow-auto border">
            {JSON.stringify(overview.data, null, 2)}
          </pre>
        </>
      )}
    </div>
  );
}
