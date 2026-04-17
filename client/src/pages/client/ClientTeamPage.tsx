import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "react-i18next";
import { useWorkspaceCompanyTrpc } from "@/hooks/useWorkspaceCompanyTrpc";

export default function ClientTeamPage() {
  const { t } = useTranslation("engagements");
  const { workspaceReady, companyId } = useWorkspaceCompanyTrpc();
  const { data, isLoading } = trpc.clientWorkspace.listTeam.useQuery(
    { companyId: companyId! },
    { enabled: workspaceReady },
  );

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">{t("clientWorkspace.teamTitle")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("clientWorkspace.teamSubtitle")}</p>
      </div>

      {isLoading && (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      )}

      <div className="space-y-2">
        {data?.map((m) => (
          <Card key={m.userId}>
            <CardContent className="py-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium">{m.name ?? "—"}</p>
                <p className="text-sm text-muted-foreground">{m.email ?? ""}</p>
              </div>
              <Badge variant="secondary" className="capitalize">
                {m.role.replace(/_/g, " ")}
              </Badge>
            </CardContent>
          </Card>
        ))}
      </div>

      {data && data.length === 0 && !isLoading && (
        <p className="text-sm text-muted-foreground text-center py-10">—</p>
      )}
    </div>
  );
}
