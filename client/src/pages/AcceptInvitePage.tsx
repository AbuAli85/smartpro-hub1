import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Clock, Users, AlertTriangle, Loader2, Building2 } from "lucide-react";
import { toast } from "sonner";
import { fmtDate, fmtDateLong, fmtDateTime, fmtDateTimeShort, fmtTime } from "@/lib/dateUtils";

const ROLE_LABELS: Record<string, string> = {
  company_admin: "Company Admin",
  company_member: "Team Member",
  finance_admin: "Finance Admin",
  hr_admin: "HR Admin",
  reviewer: "Reviewer",
};

export default function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>();
  const [, navigate] = useLocation();
  const { user, loading: authLoading } = useAuth();
  const [accepted, setAccepted] = useState(false);

  const { data: invite, isLoading: inviteLoading, error: inviteError } = trpc.companies.getInviteInfo.useQuery(
    { token: token ?? "" },
    { enabled: !!token, retry: false }
  );

  const acceptMutation = trpc.companies.acceptInvite.useMutation({
    onSuccess: () => {
      setAccepted(true);
      toast.success("Welcome to the team! Redirecting to your dashboard…");
      setTimeout(() => navigate("/dashboard"), 2000);
    },
    onError: (e) => toast.error(e.message),
  });

  // If not logged in, redirect to login with return path
  const loginUrl = getLoginUrl();

  const isExpired = invite && !invite.acceptedAt && !invite.revokedAt && new Date() > new Date(invite.expiresAt);
  const isRevoked = invite?.revokedAt != null;
  const isAlreadyAccepted = invite?.acceptedAt != null;
  const isValid = invite && !isExpired && !isRevoked && !isAlreadyAccepted;

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
              This invite was already accepted. You should already be a member of the company.
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
            <CardDescription>You have joined the company. Redirecting to your dashboard…</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // Not logged in — show sign-in prompt
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-14 h-14 rounded-full bg-orange-500/10 flex items-center justify-center mb-2">
              <Building2 className="w-7 h-7 text-orange-500" />
            </div>
            <CardTitle>You've been invited!</CardTitle>
            <CardDescription>
              Sign in to your SmartPRO account to accept this invitation and join the team.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border bg-muted/40 p-4 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Invited email</span>
                <span className="font-medium">{invite.email}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Role</span>
                <Badge variant="secondary">{ROLE_LABELS[invite.role] ?? invite.role}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Expires</span>
                <span className="font-medium">{fmtDate(invite.expiresAt)}</span>
              </div>
            </div>
            <div className="flex items-start gap-2 text-xs text-muted-foreground bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-3">
              <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />
              <span>Sign in with the email address <strong>{invite.email}</strong> to accept this invite. If you don't have an account yet, create one with that email first.</span>
            </div>
            <Button asChild className="w-full bg-orange-500 hover:bg-orange-600 text-white">
              <a href={loginUrl}>Sign in to accept invite</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Logged in — show accept button
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-14 h-14 rounded-full bg-orange-500/10 flex items-center justify-center mb-2">
            <Users className="w-7 h-7 text-orange-500" />
          </div>
          <CardTitle>Join Your Team</CardTitle>
          <CardDescription>
            You have been invited to join a company workspace on SmartPRO.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border bg-muted/40 p-4 space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Invited email</span>
              <span className="font-medium">{invite.email}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Your role</span>
              <Badge variant="secondary">{ROLE_LABELS[invite.role] ?? invite.role}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Expires</span>
              <span className="font-medium">{fmtDate(invite.expiresAt)}</span>
            </div>
          </div>

          {user.email?.toLowerCase() !== invite.email.toLowerCase() && (
            <div className="flex items-start gap-2 text-xs text-muted-foreground bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-3">
              <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />
              <span>
                You are signed in as <strong>{user.email}</strong>, but this invite was sent to <strong>{invite.email}</strong>.
                You can still accept, but make sure this is the correct account.
              </span>
            </div>
          )}

          <Button
            className="w-full bg-orange-500 hover:bg-orange-600 text-white"
            disabled={acceptMutation.isPending}
            onClick={() => acceptMutation.mutate({ token: token ?? "" })}
          >
            {acceptMutation.isPending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Accepting…</>
            ) : (
              <><CheckCircle2 className="w-4 h-4 mr-2" /> Accept Invitation</>
            )}
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => navigate("/dashboard")}>
            Maybe later
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
