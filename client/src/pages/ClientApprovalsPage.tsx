import { useTranslation } from "react-i18next";
import { ClipboardCheck, Clock, CheckCircle2, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function ClientApprovalsPage() {
  const { t } = useTranslation("hr");
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <ClipboardCheck size={24} className="text-[var(--smartpro-orange)]" />
        <div>
          <h1 className="text-2xl font-bold">{t("attendance.clientApprovalsPage.title")}</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {t("attendance.clientApprovalsPage.subtitle")}
          </p>
        </div>
      </div>

      {/* Status legend */}
      <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200">
            {t("attendance.clientApproval.status.draft")}
          </Badge>
        </div>
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
            {t("attendance.clientApproval.status.submitted")}
          </Badge>
        </div>
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
            <CheckCircle2 size={12} className="mr-1" />
            {t("attendance.clientApproval.status.approved")}
          </Badge>
        </div>
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
            <XCircle size={12} className="mr-1" />
            {t("attendance.clientApproval.status.rejected")}
          </Badge>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock size={16} className="text-muted-foreground" />
            {t("attendance.clientApprovalsPage.batchListTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="py-8 text-center space-y-3">
            <ClipboardCheck size={40} className="mx-auto text-muted-foreground opacity-30" />
            <p className="text-sm font-medium text-muted-foreground">
              {t("attendance.clientApprovalsPage.emptyState")}
            </p>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              {t("attendance.clientApprovalsPage.emptyStateHint")}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-amber-200 bg-amber-50/40">
        <CardContent className="pt-4 pb-4">
          <p className="text-xs text-amber-800 font-medium">
            {t("attendance.clientApprovalsPage.comingSoonNote")}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
