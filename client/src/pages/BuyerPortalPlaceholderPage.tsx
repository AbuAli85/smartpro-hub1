import { trpc } from "@/lib/trpc";
import { useLocation, Link } from "wouter";

/**
 * Foundation placeholder — pass `?account=<customerAccountId>` to call stub `getOverview`.
 */
export default function BuyerPortalPlaceholderPage() {
  const [location] = useLocation();
  const q = new URLSearchParams(location.split("?")[1] ?? "");
  const raw = q.get("account");
  const customerAccountId = raw != null && raw !== "" ? Number(raw) : NaN;
  const validId = Number.isInteger(customerAccountId) && customerAccountId > 0;

  const overview = trpc.buyerPortal.getOverview.useQuery(
    { customerAccountId },
    { enabled: validId, retry: false },
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold">Buyer Portal (foundation)</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Add <code className="text-xs bg-muted px-1 rounded">?account=&lt;customerAccountId&gt;</code> to test the stub API.
        </p>
      </div>
      {!validId && (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          No valid <code className="text-xs">account</code> query parameter.
        </p>
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
