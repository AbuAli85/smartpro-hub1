import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useBuyerPortalAccountSelection } from "@/hooks/useBuyerPortalAccountSelection";
import { trpc } from "@/lib/trpc";
import { useLocation, Link } from "wouter";

export default function BuyerInvoicesPage() {
  const [location] = useLocation();
  const q = new URLSearchParams(location.split("?")[1] ?? "");
  const raw = q.get("account");
  const customerAccountId = raw != null && raw !== "" ? Number(raw) : NaN;
  const validId = Number.isInteger(customerAccountId) && customerAccountId > 0;

  const accounts = useBuyerPortalAccountSelection(validId, "/buyer/invoices");

  const list = trpc.buyerPortal.listInvoices.useQuery(
    { customerAccountId, page: 1, pageSize: 50 },
    { enabled: validId, retry: false },
  );

  const accountQuery = validId ? `?account=${customerAccountId}` : "";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-bold">Invoices</h1>
        <Link href={`/buyer${accountQuery}`} className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline">
          ← Overview
        </Link>
      </div>

      {!validId && accounts.isLoading && (
        <p className="text-sm text-muted-foreground rounded-md border border-dashed p-4">Loading your buyer accounts…</p>
      )}
      {!validId && accounts.isError && (
        <p className="text-sm text-destructive rounded-md border border-dashed p-4">{accounts.error.message}</p>
      )}
      {!validId && accounts.isSuccess && accounts.data.length === 0 && (
        <p className="text-sm text-muted-foreground rounded-md border border-dashed p-4">
          You are not a member of any active buyer account. Add{" "}
          <code className="text-xs bg-muted px-1 rounded">?account=&lt;customerAccountId&gt;</code> to the URL if you are testing with a known id.
        </p>
      )}
      {!validId && accounts.isSuccess && accounts.data.length > 1 && (
        <div className="space-y-2 rounded-md border border-dashed p-4">
          <p className="text-sm font-medium">Select a buyer account</p>
          <ul className="flex flex-col gap-2">
            {accounts.data.map((a) => (
              <li key={a.customerAccountId}>
                <Button variant="outline" size="sm" className="justify-start h-auto py-2 w-full sm:w-auto" asChild>
                  <Link href={`/buyer/invoices?account=${a.customerAccountId}`}>
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

      {validId && list.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {validId && list.isError && (
        <p className="text-sm text-destructive">{list.error.message}</p>
      )}

      {validId && list.data && list.data.items.length === 0 && !list.isLoading && (
        <p className="text-sm text-muted-foreground rounded-md border border-dashed p-6 text-center">
          No linked invoices for this account yet.
        </p>
      )}

      {validId && list.data && list.data.items.length > 0 && (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>Issue</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-end">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.data.items.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.reference}</TableCell>
                  <TableCell>{row.issueDate ?? "—"}</TableCell>
                  <TableCell>{row.dueDate ?? "—"}</TableCell>
                  <TableCell className="capitalize">{row.status}</TableCell>
                  <TableCell className="text-end tabular-nums">
                    {row.amount} {row.currency}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
