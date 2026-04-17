import { useActiveCompany } from "@/contexts/ActiveCompanyContext";

/**
 * Active workspace company for tenant-scoped tRPC (`companyId` on the wire).
 * Waits until membership list + persisted selection are resolved (see ActiveCompanyProvider).
 */
export function useWorkspaceCompanyTrpc() {
  const { activeCompanyId, loading } = useActiveCompany();
  const workspaceReady = !loading && activeCompanyId != null;
  return { workspaceReady, companyId: activeCompanyId };
}
