import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { SignInTroubleshootingNote } from "@/components/SignInTroubleshootingNote";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Clock, Users, AlertTriangle, Loader2, Building2 } from "lucide-react";
import { toast } from "sonner";
import { fmtDate } from "@/lib/dateUtils";

const STORAGE_KEY = "smartpro_active_company_id";

const ROLE_LABELS: Record<string, string> = {
  company_admin: "Company Admin",
  company_member: "Team Member",
  finance_admin: "Finance Admin",
  hr_admin: "HR Admin",
  reviewer: "Reviewer",
  client: "Client",
  external_auditor: "External Auditor",
};

export default function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>();
  const [, navigate] = useLocation();
  const { user, loading: authLoading, logout } = useAuth();
  const [accepted, setAccepted] = useState(false);

  // Bug Fix 1: getInviteInfo is now a publicProcedure — works without login
  const { data: invite, isLoading: inviteLoading, error: inviteError } = trpc.companies.getInviteInfo.useQuery(
    { token: token ?? "" },
    { enabled: !!token, retry: false }
  );

  const utils = trpc.useUtils();

  const acceptMutation = trpc.companies.acceptInvite.useMutation({
    onSuccess: (data) => {
      setAccepted(true);
      // Bug Fix 3: immediately set the newly joined company as active in localStorage
      // so the dashboard loads the correct company without "No company linked" error
      if (data.companyId) {
        localStorage.setItem(STORAGE_KEY, String(data.companyId));
      }
      // Invalidate companies list so ActiveCompanyContext picks up the new membership
      utils.companies.myCompanies.invalidate();
      toast.success("Welcome to the team! Redirecting to your dashboard…");
      setTimeout(() => navigate("/dashboard"), 2000);
    },
    onError: (e) => toast.error(e.message),
  });

  // Bug Fix 2: include the invite path as returnPath so OAuth redirects back here after login
  const loginUrl = getLoginUrl(`/invite/${token}`);

  const isExpired = invite && !invite.acceptedAt && !invite.revokedAt && new Date() > new Date(invite.expiresAt);
  const isRevoked = invite?.revokedAt != null;
  const isAlreadyAccepted = invite?.acceptedAt != null;
  const isValid = invite && !isExpired && !isRevoked && !isAlreadyAccepted;

  // If user just logged in and arrived here, and invite is valid, show accept UI immediately
  useEffect(() => {
    // Nothing to auto-accept — user must click the button
  }, [user, isValid]);

  if (authLoading || inviteLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="w-8 h-8 animate-spin" />
          <p className="text-sm">Checking invite…</p>
        </div>
      </div>
    );
  }

  if (inviteError || !invite) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <div className="mx-auto w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center mb-2">
              <XCircle className="w-7 h-7 text-destructive" />
            </div>
            <CardTitle>Invite Not Found</CardTitle>
            <CardDescription>
              This invite link is invalid or has already been used. Please ask your company admin to send a new invite.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => navigate("/dashboard")} className="w-full">
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isRevoked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <div className="mx-auto w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center mb-2">
              <XCircle className="w-7 h-7 text-destructive" />
            </div>
            <CardTitle>Invite Revoked</CardTitle>
            <CardDescription>
              This invite has been revoked by a company admin. Please contact them to request a new one.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => navigate("/dashboard")} className="w-full">
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isExpired) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <div className="mx-auto w-14 h-14 rounded-full bg-yellow-500/10 flex items-center justify-center mb-2">
              <Clock className="w-7 h-7 text-yellow-500" />
            </div>
            <CardTitle>Invite Expired</CardTitle>
            <CardDescription>
              This invite expired on {fmtDate(invite.expiresAt)}. Please ask your company admin to send a fresh invite.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => navigate("/dashboard")} className="w-full">
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isAlreadyAccepted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <div className="mx-auto w-14 h-14 rounded-full bg-green-500/10 flex items-center justify-center mb-2">
              <CheckCircle2 className="w-7 h-7 text-green-500" />
            </div>
            <CardTitle>Already Accepted</CardTitle>
            <CardDescription>
              This invite was already accepted. You should already be a member of <strong>{invite.companyName}</strong>.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate("/dashboard")} className="w-full">
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (accepted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <div className="mx-auto w-14 h-14 rounded-full bg-green-500/10 flex items-center justify-center mb-2">
              <CheckCircle2 className="w-7 h-7 text-green-500" />
            </div>
            <CardTitle>Welcome aboard!</CardTitle>
            <CardDescription>
              You have joined <strong>{invite.companyName}</strong>. Redirecting to your dashboard…
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // Not logged in — show sign-in prompt with return path encoded
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-14 h-14 rounded-full bg-orange-500/10 flex items-center justify-center mb-2">
              <Building2 className="w-7 h-7 text-orange-500" />
            </div>
            <CardTitle>You've Been Invited!</CardTitle>
            <CardDescription>
              Sign in to accept your invitation and join <strong>{invite.companyName}</strong>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border bg-muted/40 p-4 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Company</span>
                <span className="font-medium">{invite.companyName}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Invited email</span>
                <span className="font-medium">{invite.email}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Your role</span>
                <Badge variant="secondary">{ROLE_LABELS[invite.role] ?? invite.role}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Invite expires</span>
                <span className="font-medium">{fmtDate(invite.expiresAt)}</span>
              </div>
            </div>
            <div className="flex items-start gap-2 text-xs text-muted-foreground bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-3">
              <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />
              <span>
                Sign in with <strong>{invite.email}</strong> to accept this invite. After signing in you will be returned to this page automatically.
              </span>
            </div>
            {/* Bug Fix 2: loginUrl includes /invite/:token as returnPath */}
            <Button asChild className="w-full bg-red-600 hover:bg-red-700 text-white">
              <a href={loginUrl}>Sign in to Accept Invitation</a>
            </Button>
            <SignInTroubleshootingNote />
          </CardContent>
        </Card>
      </div>
    );
  }

  const emailMismatch =
    !!user.email &&
    !!invite.email &&
    user.email.trim().toLowerCase() !== invite.email.trim().toLowerCase();

  // Logged in — match invite email before accepting (server enforces the same rule)
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-14 h-14 rounded-full bg-orange-500/10 flex items-center justify-center mb-2">
            <Users className="w-7 h-7 text-orange-500" />
          </div>
          <CardTitle>Join {invite.companyName}</CardTitle>
          <CardDescription>
            You have been invited to join <strong>{invite.companyName}</strong> on SmartPRO.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border bg-muted/40 p-4 space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Company</span>
              <span className="font-medium">{invite.companyName}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Invited email</span>
              <span className="font-medium">{invite.email}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Your role</span>
              <Badge variant="secondary">{ROLE_LABELS[invite.role] ?? invite.role}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Invite expires</span>
              <span className="font-medium">{fmtDate(invite.expiresAt)}</span>
            </div>
          </div>

          {emailMismatch && (
            <div className="flex items-start gap-2 text-sm text-muted-foreground bg-destructive/5 border border-destructive/20 rounded-lg p-3">
              <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
              <div className="space-y-2 min-w-0">
                <p className="font-medium text-foreground">You need to use the invited email</p>
                <p>
                  This link was issued for <strong className="text-foreground">{invite.email}</strong> because that is the address your
                  admin entered when they sent the invite. Only that address can join, so someone else cannot accept the invite if they open
                  the link while logged into another account.
                </p>
                <p>
                  You are currently signed in as <strong className="text-foreground">{user.email}</strong>. Sign out below, then sign in
                  again and choose the Google or Microsoft profile for <strong className="text-foreground">{invite.email}</strong>.
                </p>
              </div>
            </div>
          )}

          {emailMismatch ? (
            <Button
              className="w-full bg-red-600 hover:bg-red-700 text-white"
              disabled={acceptMutation.isPending}
              onClick={async () => {
                await logout();
                window.location.href = getLoginUrl(`/invite/${token ?? ""}`);
              }}
            >
              Sign out and sign in with {invite.email}
            </Button>
          ) : (
            <Button
              className="w-full bg-red-600 hover:bg-red-700 text-white"
              disabled={acceptMutation.isPending || !user.email}
              onClick={() => acceptMutation.mutate({ token: token ?? "" })}
            >
              {acceptMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Accepting…</>
              ) : (
                <><CheckCircle2 className="w-4 h-4 mr-2" /> Accept Invitation & Join Team</>
              )}
            </Button>
          )}
          {!emailMismatch && !user.email && (
            <p className="text-xs text-center text-muted-foreground">
              Your account has no email on file. Contact support or sign in with a provider that shares your email.
            </p>
          )}
          <Button variant="ghost" className="w-full" onClick={() => navigate("/dashboard")}>
            Maybe later
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
