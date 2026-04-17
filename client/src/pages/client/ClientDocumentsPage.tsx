import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslation } from "react-i18next";
import { fmtDateTimeShort } from "@/lib/dateUtils";

export default function ClientDocumentsPage() {
  const { t } = useTranslation("engagements");
  const [filter, setFilter] = useState<"all" | "pending" | "rejected" | "expiring_soon">("all");
  const { data, isLoading } = trpc.clientWorkspace.listDocuments.useQuery({ filter, page: 1, pageSize: 100 });

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{t("clientWorkspace.documentsTitle")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("clientWorkspace.documentsSubtitle")}</p>
        </div>
        <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <SelectTrigger className="w-[180px] h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="expiring_soon">Expiring soon</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading && (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      )}

      {data?.items.map((d) => (
        <Card key={d.id}>
          <CardHeader className="py-3 flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base font-medium">{d.title}</CardTitle>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/client/engagements/${d.engagementId}`}>{t("clientWorkspace.openEngagement")}</Link>
            </Button>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground pt-0">
            <p>
              {d.engagementTitle} · {d.status} · {fmtDateTimeShort(d.createdAt)}
            </p>
            {d.fileUrl && (
              <Button variant="link" className="px-0 h-auto" asChild>
                <a href={d.fileUrl} target="_blank" rel="noopener noreferrer">
                  Open file
                </a>
              </Button>
            )}
          </CardContent>
        </Card>
      ))}

      {data && data.items.length === 0 && !isLoading && (
        <p className="text-sm text-muted-foreground text-center py-10">—</p>
      )}
    </div>
  );
}
