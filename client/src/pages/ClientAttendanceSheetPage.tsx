import { useTranslation } from "react-i18next";
import { FileText } from "lucide-react";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { ClientAttendanceSheet } from "@/components/attendance/ClientAttendanceSheet";

export default function ClientAttendanceSheetPage() {
  const { t } = useTranslation("hr");
  const { activeCompanyId } = useActiveCompany();

  return (
    <div className="p-6 max-w-screen-xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <FileText size={24} className="text-[var(--smartpro-orange)]" />
        <div>
          <h1 className="text-2xl font-bold">
            {t("attendance.clientSheet.title")}
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {t("attendance.clientSheet.subtitle")}
          </p>
        </div>
      </div>

      <ClientAttendanceSheet companyId={activeCompanyId} />
    </div>
  );
}
