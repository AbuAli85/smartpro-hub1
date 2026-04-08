import { useEffect, useMemo, useRef, useState } from "react";
import { useSearch, useLocation, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, CheckCircle2, Loader2, Shield } from "lucide-react";
import { toast } from "sonner";

/**
 * Public onboarding entry for SANAD centres invited via sanad_intel_center_operations invite link.
 * Arabic-first copy; OAuth is required after lead capture (no password accounts in this app).
 */
export default function SanadJoinInvitePage() {
  const urlSearch = useSearch();
  const [, navigate] = useLocation();
  const { user, loading: authLoading } = useAuth();
  const utils = trpc.useUtils();
  const autoLinkTokenRef = useRef<string | null>(null);

  const token = useMemo(() => {
    const raw = urlSearch.startsWith("?") ? urlSearch.slice(1) : urlSearch;
    return new URLSearchParams(raw).get("token")?.trim() ?? "";
  }, [urlSearch]);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  const peek = trpc.sanad.intelligence.peekCenterInvite.useQuery(
    { token },
    { enabled: token.length > 0, retry: false },
  );

  const accept = trpc.sanad.intelligence.acceptCenterInvite.useMutation({
    onSuccess: async () => {
      toast.success("تم استلام بياناتك — أكمل عبر تسجيل الدخول إن لزم.");
      await utils.sanad.intelligence.peekCenterInvite.invalidate({ token });
    },
    onError: (e) => toast.error(e.message),
  });

  const linkAccount = trpc.sanad.intelligence.linkSanadInviteToAccount.useMutation({
    onSuccess: (data) => {
      toast.success(data.alreadyLinked ? "حسابك مرتبط بهذا المركز." : "تم ربط حسابك بمركز SANAD.");
      navigate(data.redirectTo);
    },
    onError: (e) => {
      autoLinkTokenRef.current = null;
      toast.error(e.message);
    },
  });
  const { mutate: linkMutate, isPending: linkPending, isError: linkError } = linkAccount;

  useEffect(() => {
    autoLinkTokenRef.current = null;
  }, [token]);

  useEffect(() => {
    if (authLoading || !user || !token) return;
    const p = peek.data;
    if (!p || p.expired || !p.leadCaptured || p.hasLinkedAccount) return;
    if (autoLinkTokenRef.current === token) return;
    autoLinkTokenRef.current = token;
    linkMutate({ token });
  }, [
    authLoading,
    user?.id,
    token,
    peek.data?.leadCaptured,
    peek.data?.hasLinkedAccount,
    peek.data?.expired,
    linkMutate,
  ]);

  const loginUrl = getLoginUrl(`/sanad/join?token=${encodeURIComponent(token)}`);

  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 px-4 py-16 dark:from-slate-950 dark:to-slate-900">
        <div className="mx-auto max-w-md text-center">
          <p className="text-sm text-muted-foreground" dir="rtl">
            رابط الدعوة غير صالح. يُرجى فتح الرابط الكامل الذي أرسله فريق SmartPRO.
          </p>
          <Button asChild variant="link" className="mt-4">
            <Link href="/">العودة للرئيسية</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (peek.isLoading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-sm" dir="rtl">
            جاري التحقق من الدعوة…
          </p>
        </div>
      </div>
    );
  }

  if (peek.error || !peek.data) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 px-4 py-16 dark:from-slate-950 dark:to-slate-900">
        <div className="mx-auto max-w-md text-center space-y-3">
          <p className="text-sm text-destructive" dir="rtl">
            لم نعثر على هذه الدعوة. قد تكون منتهية أو غير صحيحة.
          </p>
          <Button asChild variant="outline" size="sm">
            <Link href="/">العودة للرئيسية</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (peek.data.expired) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 px-4 py-16 dark:from-slate-950 dark:to-slate-900">
        <div className="mx-auto max-w-md text-center space-y-3">
          <p className="text-sm font-medium text-foreground" dir="rtl">
            انتهت صلاحية رابط الدعوة.
          </p>
          <p className="text-xs text-muted-foreground" dir="rtl">
            تواصل مع فريق SmartPRO لإصدار رابط جديد لمركز {peek.data.centerName}.
          </p>
        </div>
      </div>
    );
  }

  if (peek.data.hasLinkedAccount) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 px-4 py-16 dark:from-slate-950 dark:to-slate-900">
        <Card className="mx-auto max-w-lg shadow-md border-border/80">
          <CardHeader className="text-center space-y-2">
            <CheckCircle2 className="mx-auto h-10 w-10 text-primary" />
            <CardTitle className="text-lg" dir="rtl">
              تم ربط هذه الدعوة بحساب
            </CardTitle>
            <CardDescription dir="rtl">
              إذا كنت أنت من قام بالربط، يمكنك المتابعة من لوحة SmartPRO. وإلا فاطلب دعوة جديدة من فريقنا.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Button asChild className="w-full">
              <Link href="/dashboard">الانتقال إلى لوحة التحكم</Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link href="/sanad">استكشاف SANAD</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (user && peek.data.leadCaptured && !peek.data.hasLinkedAccount && linkPending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-sm" dir="rtl">
            جاري ربط حسابك…
          </p>
        </div>
      </div>
    );
  }

  if (user && peek.data.leadCaptured && !peek.data.hasLinkedAccount && linkError) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 px-4 py-16 dark:from-slate-950 dark:to-slate-900">
        <Card className="mx-auto max-w-lg shadow-md border-border/80">
          <CardHeader className="text-center space-y-2">
            <CardTitle className="text-lg" dir="rtl">
              تعذّر الربط التلقائي
            </CardTitle>
            <CardDescription dir="rtl">يمكنك المحاولة مرة أخرى يدوياً.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              className="w-full gap-2"
              onClick={() => linkMutate({ token })}
              disabled={linkPending}
            >
              {linkPending ? <Loader2 className="h-4 w-4 animate-spin shrink-0" /> : null}
              <span dir="rtl">ربط حسابي الآن</span>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (peek.data.leadCaptured && !user) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 px-4 py-16 dark:from-slate-950 dark:to-slate-900">
        <Card className="mx-auto max-w-lg shadow-md border-border/80">
          <CardHeader className="space-y-1 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <CardTitle className="text-lg" dir="rtl">
              شكراً — أكمل عبر SmartPRO
            </CardTitle>
            <CardDescription className="text-center" dir="rtl">
              سجّل الدخول بنفس المتصفح لربط هذا المركز بحسابك. SmartPRO يكمّل SANAD ولا يحل محل أنظمتكم التشغيلية.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Button asChild className="w-full">
              <a href={loginUrl}>تسجيل الدخول / إنشاء حساب</a>
            </Button>
            <p className="text-center text-xs text-muted-foreground" dir="rtl">
              بعد تسجيل الدخول سيتم ربط الدعوة تلقائياً.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 px-4 py-10 dark:from-slate-950 dark:to-slate-900">
      <div className="mx-auto max-w-lg space-y-6">
        <div className="flex items-start gap-3 rounded-xl border border-border/80 bg-card/80 p-4 shadow-sm backdrop-blur-sm">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Building2 className="h-5 w-5" />
          </div>
          <div className="min-w-0 space-y-1">
            <h1 className="text-base font-semibold leading-snug text-foreground" dir="rtl">
              دعوة للانضمام — {peek.data.centerName}
            </h1>
            <p className="text-xs text-muted-foreground" dir="rtl">
              {peek.data.governorateLabelRaw}
              {peek.data.wilayat ? ` · ${peek.data.wilayat}` : ""}
            </p>
          </div>
        </div>

        <Card className="border-border/80 shadow-md">
          <CardHeader>
            <div className="flex items-center gap-2 text-primary">
              <Shield className="h-4 w-4" />
              <CardTitle className="text-base">SmartPRO + SANAD</CardTitle>
            </div>
            <CardDescription className="leading-relaxed" dir="rtl">
              SmartPRO منصّة تشغيل للشركات والخدمات الحكومية؛ نُكمّل عمل مراكز SANAD ونوحّد المتابعة والامتثال دون استبدال
              أنظمتكم الحالية.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                accept.mutate({
                  token,
                  name: name.trim(),
                  phone: phone.trim(),
                  email: email.trim() || undefined,
                });
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="sj-name" dir="rtl">
                  الاسم الكامل
                </Label>
                <Input
                  id="sj-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoComplete="name"
                  dir="auto"
                  className="text-start"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sj-phone" dir="rtl">
                  رقم الجوال
                </Label>
                <Input
                  id="sj-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  autoComplete="tel"
                  dir="ltr"
                  className="text-start"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sj-email" dir="rtl">
                  البريد (اختياري)
                </Label>
                <Input
                  id="sj-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  dir="ltr"
                  className="text-start"
                />
              </div>
              <Button type="submit" className="w-full" disabled={accept.isPending}>
                {accept.isPending ? (
                  <>
                    <Loader2 className="me-2 h-4 w-4 animate-spin" />
                    جاري الإرسال…
                  </>
                ) : (
                  <span dir="rtl">متابعة</span>
                )}
              </Button>
            </form>
            <p className="text-center text-[11px] text-muted-foreground leading-relaxed" dir="rtl">
              بالمتابعة، تؤكد أنك مفوّض للتواصل عن هذا المركز. قد نطلب مستندات إضافية لاحقاً ضمن مسار الامتثال.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
