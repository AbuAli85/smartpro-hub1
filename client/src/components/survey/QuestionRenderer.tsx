import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, Star } from "lucide-react";
import { useTranslation } from "react-i18next";

interface Option {
  id: number;
  value: string;
  labelEn: string;
  labelAr: string;
  sortOrder: number;
}

interface Question {
  id: number;
  type: string;
  labelEn: string;
  labelAr: string;
  hintEn: string | null;
  hintAr: string | null;
  isRequired: boolean;
  settings: Record<string, unknown> | null;
}

interface AnswerState {
  answerValue: string | null;
  selectedOptions: number[];
}

interface QuestionRendererProps {
  question: Question;
  options: Option[];
  language: string;
  answer: AnswerState;
  onChange: (answer: AnswerState) => void;
}

export default function QuestionRenderer({
  question,
  options,
  language,
  answer,
  onChange,
}: QuestionRendererProps) {
  const { t } = useTranslation("survey");
  const isAr = language.startsWith("ar");
  const label = isAr ? question.labelAr : question.labelEn;
  const hint = isAr ? question.hintAr : question.hintEn;
  const sortedOptions = [...options].sort((a, b) => a.sortOrder - b.sortOrder);

  const getOptionLabel = (opt: Option) => (isAr ? opt.labelAr : opt.labelEn);

  return (
    <div className="space-y-3">
      {/* Question label */}
      <div className="space-y-1">
        <p className="text-base font-medium leading-relaxed text-foreground">
          {label}
          {question.isRequired && (
            <span className="ms-1 text-red-500" aria-label={t("required")}>*</span>
          )}
        </p>
        {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      </div>

      {/* Text */}
      {question.type === "text" && (
        <Input
          value={answer.answerValue ?? ""}
          onChange={(e) => onChange({ ...answer, answerValue: e.target.value })}
          placeholder={t("typeAnswer")}
          className="h-10 rounded-xl"
        />
      )}

      {/* Textarea */}
      {question.type === "textarea" && (
        <textarea
          className="flex min-h-[88px] w-full rounded-xl border border-input bg-transparent px-3.5 py-2.5 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none disabled:opacity-50 transition-colors"
          value={answer.answerValue ?? ""}
          onChange={(e) => onChange({ ...answer, answerValue: e.target.value })}
          placeholder={t("typeAnswer")}
          rows={3}
        />
      )}

      {/* Number */}
      {question.type === "number" && (
        <Input
          type="number"
          value={answer.answerValue ?? ""}
          onChange={(e) => onChange({ ...answer, answerValue: e.target.value })}
          placeholder="0"
          className="h-10 max-w-[200px] rounded-xl"
        />
      )}

      {/* Single choice */}
      {question.type === "single_choice" && (
        <div className="space-y-2">
          {sortedOptions.map((opt) => {
            const selected = answer.selectedOptions.includes(opt.id);
            return (
              <button
                key={opt.id}
                type="button"
                aria-pressed={selected}
                onClick={() =>
                  onChange({ answerValue: opt.value, selectedOptions: [opt.id] })
                }
                className={`flex min-h-[44px] w-full items-center gap-3 rounded-xl border-2 px-4 py-2.5 text-start transition-[border-color,background-color,box-shadow,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.995] sm:min-h-0 sm:py-3 ${
                  selected
                    ? "border-primary bg-primary/10 shadow-[0_1px_0_0_rgba(0,0,0,0.04)] ring-1 ring-primary/25"
                    : "border-transparent bg-muted/35 hover:border-muted-foreground/20 hover:bg-muted/55"
                }`}
              >
                <span
                  className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 transition-all ${
                    selected
                      ? "border-primary bg-primary shadow-sm"
                      : "border-muted-foreground/25"
                  }`}
                >
                  {selected && (
                    <span className="h-2 w-2 rounded-full bg-white" />
                  )}
                </span>
                <span className={`text-sm leading-snug ${selected ? "font-medium text-foreground" : "text-foreground/80"}`}>
                  {getOptionLabel(opt)}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Multi choice */}
      {question.type === "multi_choice" && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{t("selectMultiple")}</p>
          {sortedOptions.map((opt) => {
            const checked = answer.selectedOptions.includes(opt.id);
            return (
              <button
                key={opt.id}
                type="button"
                aria-pressed={checked}
                onClick={() => {
                  const next = checked
                    ? answer.selectedOptions.filter((id) => id !== opt.id)
                    : [...answer.selectedOptions, opt.id];
                  const values = next
                    .map((id) => options.find((o) => o.id === id)?.value)
                    .filter(Boolean)
                    .join(",");
                  onChange({ answerValue: values || null, selectedOptions: next });
                }}
                className={`flex min-h-[44px] w-full items-center gap-3 rounded-xl border-2 px-4 py-2.5 text-start transition-[border-color,background-color,box-shadow,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.995] sm:min-h-0 sm:py-3 ${
                  checked
                    ? "border-primary bg-primary/10 shadow-[0_1px_0_0_rgba(0,0,0,0.04)] ring-1 ring-primary/25"
                    : "border-transparent bg-muted/35 hover:border-muted-foreground/20 hover:bg-muted/55"
                }`}
              >
                <span
                  className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border-2 transition-all ${
                    checked
                      ? "border-primary bg-primary shadow-sm"
                      : "border-muted-foreground/25"
                  }`}
                >
                  {checked && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                </span>
                <span className={`text-sm leading-snug ${checked ? "font-medium text-foreground" : "text-foreground/80"}`}>
                  {getOptionLabel(opt)}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Dropdown */}
      {question.type === "dropdown" && (() => {
        const hasValue = answer.selectedOptions.length > 0;
        return (
          <div className="relative w-full">
            {hasValue ? (
              <span
                className="pointer-events-none absolute start-3 top-1/2 z-[2] -translate-y-1/2"
                aria-hidden
              >
                <Check className="h-4 w-4 text-primary" strokeWidth={2.5} />
              </span>
            ) : null}
            <Select
              value={answer.selectedOptions[0]?.toString() ?? ""}
              onValueChange={(val) => {
                const optId = Number(val);
                const opt = options.find((o) => o.id === optId);
                onChange({
                  answerValue: opt?.value ?? null,
                  selectedOptions: [optId],
                });
              }}
            >
              <SelectTrigger
                className={`h-11 w-full rounded-xl transition-[border-color,background-color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:h-10 ${
                  hasValue
                    ? "border-primary/60 bg-primary/10 ps-10 font-medium text-foreground shadow-sm ring-1 ring-primary/25"
                    : "border-input bg-background hover:bg-muted/30"
                }`}
              >
                <SelectValue placeholder={t("selectOption")} />
              </SelectTrigger>
              <SelectContent>
                {sortedOptions.map((opt) => (
                  <SelectItem key={opt.id} value={opt.id.toString()}>
                    {getOptionLabel(opt)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
      })()}

      {/* Yes / No */}
      {question.type === "yes_no" && (
        <div className="flex gap-3">
          {[
            { value: "yes", label: isAr ? "نعم" : "Yes" },
            { value: "no", label: isAr ? "لا" : "No" },
          ].map((opt) => {
            const active = answer.answerValue === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                aria-pressed={active}
                onClick={() => onChange({ answerValue: opt.value, selectedOptions: [] })}
                className={`min-h-[44px] flex-1 rounded-xl border-2 py-2.5 text-sm font-semibold transition-[border-color,background-color,box-shadow,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.99] sm:min-h-0 sm:py-3 ${
                  active
                    ? "border-primary bg-primary/10 text-primary shadow-[0_1px_0_0_rgba(0,0,0,0.04)] ring-1 ring-primary/25"
                    : "border-transparent bg-muted/35 text-foreground/75 hover:border-muted-foreground/20 hover:bg-muted/55"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Rating */}
      {question.type === "rating" && (
        <div className="flex flex-wrap gap-1 py-1 sm:gap-1.5">
          {Array.from({ length: (question.settings as { max?: number })?.max ?? 5 }, (_, i) => i + 1).map(
            (star) => {
              const filled = Number(answer.answerValue) >= star;
              return (
                <button
                  key={star}
                  type="button"
                  onClick={() =>
                    onChange({ answerValue: star.toString(), selectedOptions: [] })
                  }
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 sm:min-h-0 sm:min-w-0 sm:p-1"
                >
                  <Star
                    size={32}
                    className={`transition-colors ${
                      filled
                        ? "fill-amber-400 text-amber-400"
                        : "text-muted-foreground/25 hover:text-amber-300/50"
                    }`}
                  />
                </button>
              );
            },
          )}
        </div>
      )}
    </div>
  );
}
