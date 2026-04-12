import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useRoute } from "wouter";
import { toast } from "sonner";
import { ArrowRight, CheckCircle2, ChevronDown, ChevronUp, Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { surveyResumeStorageKey } from "@/pages/SurveyStartPage";

export default function SurveyCompletePage() {
  const { t, i18n } = useTranslation("survey");
  const isRtl = i18n.language?.startsWith("ar");
  const [match, params] = useRoute("/survey/:slug/complete");
  const slug = match ? params?.slug ?? "" : "";
  const [copying, setCopying] = useState(false);
  const [showToken, setShowToken] = useState(false);

  const resumeToken = useMemo(() => {
    if (!slug) return "";
    try {
      return localStorage.getItem(surveyResumeStorageKey(slug)) ?? "";
    } catch {
      return "";
    }
  }, [slug]);

  const handleCopy = async () => {
    if (!resumeToken) return;
    setCopying(true);
    try {
      await navigator.clipboard.writeText(resumeToken);
      toast.success(t("tokenCopied"));
    } catch {
      toast.error(t("copyFailed"));
    } finally {
      setCopying(false);
    }
  };

  if (!match || !slug) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" aria-hidden />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-gradient-to-br from-emerald-950 via-slate-900 to-indigo-950 text-slate-50"
      dir={isRtl ? "rtl" : "ltr"}
    >
      {/* Header */}
      <header className="border-b border-white/10 bg-black/20 backdrop-blur-md">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-3">
          <Link href="/survey">
            <span className="text-sm font-medium text-white/70 hover:text-white transition-colors">
              {t("backToSurvey")}
            </span>
          </Link>
          <Badge
            variant="secondary"
            className="border border-white/10 bg-white/10 text-xs text-white backdrop-blur"
          >
            {t("title")}
          </Badge>
        </div>
      </header>

      <main className="mx-auto flex max-w-lg flex-col items-center px-4 py-14 sm:py-20">
        {/* Success icon */}
        <div className="mb-8 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/20 ring-4 ring-emerald-400/30">
          <CheckCircle2 className="h-12 w-12 text-emerald-300" aria-hidden />
        </div>

        {/* Main card */}
        <div className="w-full rounded-2xl border border-white/10 bg-white text-slate-900 shadow-2xl overflow-hidden">
          {/* Title */}
          <div className="px-6 pt-8 pb-6 text-center space-y-2">
            <h1 className="text-2xl font-bold">{t("completeTitle")}</h1>
            <p className="text-base text-slate-500">{t("completeSubtitle")}</p>
          </div>

          {/* Message */}
          <div className="px-6 pb-6">
            <p className="text-sm leading-relaxed text-slate-600 text-center">
              {t("completeMessage")}
            </p>
          </div>

          {/* What happens next */}
          <div className="mx-6 mb-6 rounded-xl bg-indigo-50/80 p-4 space-y-1.5">
            <p className="text-sm font-semibold text-indigo-900">{t("whatNext")}</p>
            <p className="text-sm leading-relaxed text-indigo-700/80">{t("whatNextMessage")}</p>
          </div>

          {/* Token section — collapsed by default */}
          {resumeToken && (
            <div className="border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowToken((v) => !v)}
                className="flex w-full items-center justify-between px-6 py-3 text-xs font-medium text-slate-400 hover:text-slate-600 transition-colors"
              >
                <span>{t("resumeTokenSaved")}</span>
                {showToken ? (
                  <ChevronUp className="h-3.5 w-3.5" aria-hidden />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                )}
              </button>

              {showToken && (
                <div className="border-t border-slate-50 px-6 pb-4 pt-2">
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded border bg-slate-50 px-2.5 py-1.5 font-mono text-xs text-slate-600 truncate">
                      {resumeToken}
                    </code>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0 gap-1.5 text-xs"
                      onClick={handleCopy}
                      disabled={copying}
                    >
                      {copying ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                      ) : (
                        <Copy className="h-3.5 w-3.5" aria-hidden />
                      )}
                      {t("copyToken")}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Footer CTA */}
          <div className="border-t border-slate-100 px-6 py-4 flex justify-center">
            <Button
              asChild
              className="gap-2 bg-indigo-600 hover:bg-indigo-700"
            >
              <Link href="/">
                {t("backToHome")}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
