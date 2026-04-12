import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useRoute } from "wouter";
import { toast } from "sonner";
import { CheckCircle2, Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { surveyResumeStorageKey } from "@/pages/SurveyStartPage";

export default function SurveyCompletePage() {
  const { t, i18n } = useTranslation("survey");
  const isRtl = i18n.language?.startsWith("ar");
  const [match, params] = useRoute("/survey/:slug/complete");
  const slug = match ? params?.slug ?? "" : "";
  const [copying, setCopying] = useState(false);

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
      <header className="border-b border-white/10 bg-black/20 backdrop-blur-md">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-4">
          <Badge
            variant="secondary"
            className="border border-white/10 bg-white/10 text-white backdrop-blur"
          >
            {t("title")}
          </Badge>
        </div>
      </header>

      <main className="mx-auto flex max-w-lg flex-col items-center px-4 py-16">
        <div className="mb-8 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/20 ring-4 ring-emerald-400/30">
          <CheckCircle2 className="h-12 w-12 text-emerald-300" aria-hidden />
        </div>

        <Card className="w-full border-white/10 bg-white/95 text-slate-900 shadow-2xl">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">{t("completeTitle")}</CardTitle>
            <CardDescription className="text-base text-slate-600">
              {t("completeMessage")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="mb-2 text-sm font-medium text-slate-700">{t("resumeTokenSaved")}</p>
              {resumeToken ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Input readOnly value={resumeToken} className="font-mono text-sm" />
                  <Button
                    type="button"
                    variant="outline"
                    className="shrink-0 gap-2"
                    onClick={handleCopy}
                    disabled={copying}
                  >
                    {copying ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Copy className="h-4 w-4" aria-hidden />
                    )}
                    {t("copyToken")}
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-slate-500">{t("resumeInstructions")}</p>
              )}
            </div>
          </CardContent>
          <CardFooter className="flex justify-center border-t border-slate-100 pt-2">
            <Button asChild variant="default" className="gap-2 bg-indigo-600 hover:bg-indigo-700">
              <Link href="/">{t("backToHome")}</Link>
            </Button>
          </CardFooter>
        </Card>
      </main>
    </div>
  );
}
