import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "react-i18next";
import { fmtDateTimeShort } from "@/lib/dateUtils";

export default function ClientMessagesPage() {
  const { t } = useTranslation("engagements");
  const { data, isLoading } = trpc.clientWorkspace.listThreads.useQuery();

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">{t("clientWorkspace.messagesTitle")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("clientWorkspace.messagesSubtitle")}</p>
      </div>

      {isLoading && (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      )}

      {data?.map((thread) => (
        <Link key={thread.engagementId} href={`/client/engagements/${thread.engagementId}`}>
          <Card className="hover:bg-muted/30 transition-colors cursor-pointer">
            <CardHeader className="py-4 flex flex-row items-start justify-between gap-2">
              <div className="min-w-0">
                <CardTitle className="text-base font-medium truncate">{thread.title}</CardTitle>
                {thread.lastPreview && (
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{thread.lastPreview}</p>
                )}
                {thread.lastMessageAt && (
                  <p className="text-xs text-muted-foreground mt-1">{fmtDateTimeShort(thread.lastMessageAt)}</p>
                )}
              </div>
              {thread.unreadCount > 0 && (
                <Badge variant="destructive" className="shrink-0">
                  {thread.unreadCount}
                </Badge>
              )}
            </CardHeader>
            <CardContent className="pt-0 pb-4 text-xs text-primary">Open thread →</CardContent>
          </Card>
        </Link>
      ))}

      {data && data.length === 0 && !isLoading && (
        <p className="text-sm text-muted-foreground text-center py-10">—</p>
      )}
    </div>
  );
}
