import { useTranslation } from "react-i18next";

interface SurveyProgressProps {
  currentIndex: number;
  totalSections: number;
  sectionTitle: string;
}

export default function SurveyProgress({
  currentIndex,
  totalSections,
  sectionTitle,
}: SurveyProgressProps) {
  const { t } = useTranslation("survey");
  const pct = totalSections > 0 ? Math.round(((currentIndex + 1) / totalSections) * 100) : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-foreground">{sectionTitle}</span>
        <span className="text-muted-foreground">
          {t("progress", { current: currentIndex + 1, total: totalSections })}
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
