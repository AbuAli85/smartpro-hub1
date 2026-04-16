import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function MfaChallengePage() {
  const [loc] = useLocation();
  const challengeId = useMemo(() => {
    const q = loc.includes("?") ? loc.split("?")[1] : "";
    return new URLSearchParams(q).get("challenge");
  }, [loc]);

  const [code, setCode] = useState("");

  const preview = trpc.twoFactor.getChallengePreview.useQuery(
    { challengeId: challengeId ?? "" },
    { enabled: Boolean(challengeId && challengeId.length === 36), retry: false }
  );

  const verify = trpc.twoFactor.verifyChallenge.useMutation({
    onSuccess: (data) => {
      window.location.href = data.redirectTo || "/";
    },
  });

  if (!challengeId || challengeId.length < 36) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Invalid link</CardTitle>
            <CardDescription>Start sign-in again from the SmartPRO app.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (preview.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <p className="text-muted-foreground text-sm">Checking challenge…</p>
      </div>
    );
  }

  if (preview.data?.status !== "ok") {
    const msg =
      preview.data?.status === "expired"
        ? "This sign-in challenge has expired. Please sign in again."
        : preview.data?.status === "used"
          ? "This challenge was already used."
          : "Challenge not found.";
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Cannot continue</CardTitle>
            <CardDescription>{msg}</CardDescription>
          </CardHeader>
          <CardContent>
            <a href="/" className="text-primary text-sm underline">
              Back to home
            </a>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-muted/30">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader>
          <CardTitle>Verify it’s you</CardTitle>
          <CardDescription>
            Enter the 6-digit code from your authenticator app, or a one-time backup code.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="mfa-code">Code</Label>
            <Input
              id="mfa-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoFocus
            />
          </div>
          {verify.error ? <p className="text-sm text-destructive">{verify.error.message}</p> : null}
          <Button
            className="w-full"
            disabled={verify.isPending || code.replace(/\s/g, "").length < 6}
            onClick={() => verify.mutate({ challengeId, code: code.trim() })}
          >
            {verify.isPending ? "Verifying…" : "Continue"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
