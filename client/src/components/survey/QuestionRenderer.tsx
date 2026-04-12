import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Star } from "lucide-react";
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
      <div className="flex items-start gap-2">
        <Label className="text-sm font-medium leading-relaxed">{label}</Label>
        {question.isRequired && (
          <Badge variant="outline" className="text-[10px] shrink-0">
            {t("required")}
          </Badge>
        )}
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}

      {question.type === "text" && (
        <Input
          value={answer.answerValue ?? ""}
          onChange={(e) => onChange({ ...answer, answerValue: e.target.value })}
          placeholder={t("typeAnswer")}
        />
      )}

      {question.type === "textarea" && (
        <textarea
          className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none disabled:opacity-50"
          value={answer.answerValue ?? ""}
          onChange={(e) => onChange({ ...answer, answerValue: e.target.value })}
          placeholder={t("typeAnswer")}
          rows={3}
        />
      )}

      {question.type === "number" && (
        <Input
          type="number"
          value={answer.answerValue ?? ""}
          onChange={(e) => onChange({ ...answer, answerValue: e.target.value })}
          placeholder="0"
        />
      )}

      {question.type === "single_choice" && (
        <div className="space-y-2">
          {sortedOptions.map((opt) => (
            <label
              key={opt.id}
              className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                answer.selectedOptions.includes(opt.id)
                  ? "border-primary bg-primary/5"
                  : "border-input hover:bg-accent/50"
              }`}
            >
              <input
                type="radio"
                name={`q-${question.id}`}
                checked={answer.selectedOptions.includes(opt.id)}
                onChange={() =>
                  onChange({ answerValue: opt.value, selectedOptions: [opt.id] })
                }
                className="accent-primary"
              />
              <span className="text-sm">{getOptionLabel(opt)}</span>
            </label>
          ))}
        </div>
      )}

      {question.type === "multi_choice" && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{t("selectMultiple")}</p>
          {sortedOptions.map((opt) => {
            const checked = answer.selectedOptions.includes(opt.id);
            return (
              <label
                key={opt.id}
                className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                  checked ? "border-primary bg-primary/5" : "border-input hover:bg-accent/50"
                }`}
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={(c) => {
                    const next = c
                      ? [...answer.selectedOptions, opt.id]
                      : answer.selectedOptions.filter((id) => id !== opt.id);
                    const values = next
                      .map((id) => options.find((o) => o.id === id)?.value)
                      .filter(Boolean)
                      .join(",");
                    onChange({ answerValue: values || null, selectedOptions: next });
                  }}
                />
                <span className="text-sm">{getOptionLabel(opt)}</span>
              </label>
            );
          })}
        </div>
      )}

      {question.type === "dropdown" && (
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
          <SelectTrigger className="w-full">
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
      )}

      {question.type === "yes_no" && (
        <div className="flex gap-3">
          {[
            { value: "yes", label: isAr ? "نعم" : "Yes" },
            { value: "no", label: isAr ? "لا" : "No" },
          ].map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange({ answerValue: opt.value, selectedOptions: [] })}
              className={`flex-1 rounded-lg border p-3 text-sm font-medium transition-colors ${
                answer.answerValue === opt.value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-input hover:bg-accent/50"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {question.type === "rating" && (
        <div className="flex gap-1">
          {Array.from({ length: (question.settings as any)?.max ?? 5 }, (_, i) => i + 1).map(
            (star) => (
              <button
                key={star}
                type="button"
                onClick={() =>
                  onChange({ answerValue: star.toString(), selectedOptions: [] })
                }
                className="p-1 transition-colors"
              >
                <Star
                  size={28}
                  className={
                    Number(answer.answerValue) >= star
                      ? "fill-amber-400 text-amber-400"
                      : "text-muted-foreground/30"
                  }
                />
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
