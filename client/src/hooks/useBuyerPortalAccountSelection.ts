import { trpc } from "@/lib/trpc";
import { useEffect } from "react";
import { useLocation } from "wouter";

/**
 * When `account` is missing: loads memberships; if exactly one, redirects to that account on `targetBase`.
 */
export function useBuyerPortalAccountSelection(validId: boolean, targetBase: "/buyer" | "/buyer/invoices") {
  const [, navigate] = useLocation();
  const list = trpc.buyerPortal.listMyAccounts.useQuery(undefined, { enabled: !validId, retry: false });

  useEffect(() => {
    if (validId) return;
    if (!list.isSuccess || list.data.length !== 1) return;
    navigate(`${targetBase}?account=${list.data[0].customerAccountId}`, { replace: true });
  }, [validId, list.isSuccess, list.data, navigate, targetBase]);

  return list;
}
