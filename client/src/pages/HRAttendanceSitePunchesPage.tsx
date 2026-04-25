import { useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { MapPin } from "lucide-react";
import { fmtTime } from "@/lib/dateUtils";
import { muscatCalendarYmdNow } from "@shared/attendanceMuscatTime";

function SitePunchesSection({ companyId }: { companyId: number | null }) {
  const { t } = useTranslation("hr");
  const [punchDate, setPunchDate] = useState(() => muscatCalendarYmdNow());
  const { data = [], isLoading } = trpc.attendance.adminBoard.useQuery(
    { companyId: companyId ?? undefined, date: punchDate },
    { enabled: companyId != null },
  );

  // Only show rows with actual clock records (adminBoard includes scheduled-but-absent after P3)
  const punchRows = (data as any[]).filter((row: any) => row.record != null);

  if (companyId == null) {
    return (
      <div className="py-12 text-center text-muted-foreground border border-dashed rounded-lg">
        {t("attendance.sitePunches.selectCompany")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{t("attendance.sitePunches.dateLabel")}</Label>
          <Input
            type="date"
            value={punchDate}
            onChange={(e) => setPunchDate(e.target.value)}
            className="h-9 w-44 text-sm"
          />
        </div>
      </div>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            {t("attendance.sitePunches.clockPunches", { date: punchDate })}
            <Badge variant="outline" className="text-xs font-normal">{t("attendance.sitePunches.rows", { count: punchRows.length })}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">{t("attendance.sitePunches.loading")}</p>
          ) : punchRows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">{t("attendance.sitePunches.noPunches")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[800px]">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="text-left py-2 px-2 font-medium">{t("attendance.sitePunches.employee")}</th>
                    <th className="text-left py-2 px-2 font-medium">{t("attendance.sitePunches.checkIn")}</th>
                    <th className="text-left py-2 px-2 font-medium">{t("attendance.sitePunches.checkOut")}</th>
                    <th className="text-left py-2 px-2 font-medium">{t("attendance.sitePunches.duration")}</th>
                    <th className="text-left py-2 px-2 font-medium">{t("attendance.sitePunches.source")}</th>
                    <th className="text-left py-2 px-2 font-medium">{t("attendance.sitePunches.geo")}</th>
                  </tr>
                </thead>
                <tbody>
                  {punchRows.map((row: any) => (
                    <tr key={row.record.id} className="border-t hover:bg-muted/40">
                      <td className="py-2 px-2">
                        <span className="font-medium">
                          {row.employee.firstName} {row.employee.lastName}
                        </span>
                        {row.employee.department ? (
                          <span className="text-xs text-muted-foreground ml-1">· {row.employee.department}</span>
                        ) : null}
                      </td>
                      <td className="py-2 px-2 whitespace-nowrap">{fmtTime(row.record.checkIn)}</td>
                      <td className="py-2 px-2 whitespace-nowrap">
                        {row.record.checkOut ? fmtTime(row.record.checkOut) : "—"}
                      </td>
                      <td className="py-2 px-2">{row.durationMinutes}m</td>
                      <td className="py-2 px-2 text-muted-foreground text-xs">{row.methodLabel}</td>
                      <td className="py-2 px-2">
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="h-3 w-3 shrink-0" />
                          {row.hasCheckInGeo || row.hasCheckOutGeo ? t("attendance.sitePunches.inOutGps") : t("attendance.sitePunches.noGps")}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function HRAttendanceSitePunchesPage() {
  const { activeCompanyId } = useActiveCompany();
  return <SitePunchesSection companyId={activeCompanyId} />;
}
