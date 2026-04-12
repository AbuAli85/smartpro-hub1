import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useRoute } from "wouter";
import { toast } from "sonner";
import { ArrowRight, CheckCircle2, ChevronDown, ChevronUp, Copy, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
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
      className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 text-slate-50"
      dir={isRtl ? "rtl" : "ltr"}
    >
      <header className="sticky top-0 z-10 border-b border-white/10 bg-black/25 backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3 sm:px-5">
          <Link href="/survey">
            <span className="text-sm font-medium text-white/75 hover:text-white transition-colors">
              {t("backToSurvey")}
            </span>
          </Link>
          <div className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-white backdrop-blur sm:text-xs">
            <Sparkles className="h-3.5 w-3.5 text-amber-200/90" aria-hidden />
            {t("title")}
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-2xl flex-col items-center px-4 pb-14 pt-8 sm:px-5 sm:pb-20 sm:pt-12">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20 ring-[3px] ring-emerald-400/25 sm:mb-8 sm:h-20 sm:w-20 sm:ring-4">
          <CheckCircle2 className="h-10 w-10 text-emerald-300 sm:h-12 sm:w-12" aria-hidden />
        </div>

        <div className="w-full overflow-hidden rounded-2xl border border-white/10 bg-white text-slate-900 shadow-2xl ring-1 ring-black/5">
          <div className="h-1 bg-gradient-to-r from-indigo-500 via-violet-500 to-indigo-600" />
          <div className="space-y-2 px-5 pt-7 pb-5 text-center sm:px-8 sm:pt-8 sm:pb-6">
            <h1 className="text-xl font-bold sm:text-2xl">{t("completeTitle")}</h1>
            <p className="text-sm text-slate-500 sm:text-base">{t("completeSubtitle")}</p>
          </div>

          <div className="px-5 pb-5 sm:px-8 sm:pb-6">
            <p className="text-center text-sm leading-relaxed text-slate-600">
              {t("completeMessage")}
            </p>
          </div>

          <div className="mx-4 mb-5 space-y-1.5 rounded-xl bg-indigo-50/90 p-4 sm:mx-6 sm:mb-6">
            <p className="text-sm font-semibold text-indigo-900">{t("whatNext")}</p>
            <p className="text-sm leading-relaxed text-indigo-700/80">{t("whatNextMessage")}</p>
          </div>

          {/* Token section — collapsed by default */}
          {resumeToken && (
            <div className="border-t border-slate-100 bg-slate-50/40">
              <button
                type="button"
                aria-expanded={showToken}
                onClick={() => setShowToken((v) => !v)}
                className="flex w-full min-h-[40px] items-center justify-between px-5 py-2.5 text-left text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100/60 hover:text-slate-700 sm:px-6"
              >
                <span>{t("resumeTokenSaved")}</span>
                {showToken ? (
                  <ChevronUp className="h-3.5 w-3.5" aria-hidden />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                )}
              </button>

              {showToken && (
                <div className="border-t border-slate-100/80 px-5 pb-4 pt-2 sm:px-6">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <code className="min-h-[44px] flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-2 font-mono text-xs text-slate-600 sm:min-h-0 sm:py-1.5">
                      {resumeToken}
                    </code>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0 gap-1.5 text-xs min-h-[44px] sm:min-h-0"
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

          <div className="flex justify-center border-t border-slate-100 px-5 py-4 sm:px-6">
            <Button
              asChild
              className="h-11 min-h-[44px] w-full max-w-xs gap-2 bg-indigo-600 shadow-sm hover:bg-indigo-700 sm:min-h-10 sm:w-auto"
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
