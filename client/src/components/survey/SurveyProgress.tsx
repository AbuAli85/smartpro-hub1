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
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-foreground truncate">
          {sectionTitle}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs font-medium text-muted-foreground">
            {t("progress", { current: currentIndex + 1, total: totalSections })}
          </span>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
            {pct}%
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Step dots */}
      {totalSections > 1 && totalSections <= 10 && (
        <div className="flex items-center justify-center gap-1.5">
          {Array.from({ length: totalSections }, (_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i <= currentIndex
                  ? "w-4 bg-primary"
                  : "w-1.5 bg-muted-foreground/20"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
