import { useTranslation } from "react-i18next";
import { FileText, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ClientAttendanceSheetPage() {
  const { t } = useTranslation("hr");
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <FileText size={24} className="text-[var(--smartpro-orange)]" />
        <div>
          <h1 className="text-2xl font-bold">{t("attendance.clientSheetPage.title")}</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {t("attendance.clientSheetPage.subtitle")}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock size={16} className="text-muted-foreground" />
            {t("attendance.clientSheetPage.sheetTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="py-8 text-center space-y-3">
            <FileText size={40} className="mx-auto text-muted-foreground opacity-30" />
            <p className="text-sm font-medium text-muted-foreground">
              {t("attendance.clientSheetPage.emptyState")}
            </p>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              {t("attendance.clientSheetPage.emptyStateHint")}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-blue-200 bg-blue-50/40">
        <CardContent className="pt-4 pb-4 space-y-1.5">
          <p className="text-xs text-blue-800 font-semibold">
            {t("attendance.clientSheetPage.plannedColumnsTitle")}
          </p>
          <p className="text-xs text-blue-700">
            {t("attendance.clientSheetPage.plannedColumnsDesc")}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
