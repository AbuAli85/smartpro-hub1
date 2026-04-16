import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export function TwoFactorSettings() {
  const utils = trpc.useUtils();
  const { data: status, isLoading } = trpc.twoFactor.getStatus.useQuery();
  const setupInitiate = trpc.twoFactor.setupInitiate.useMutation({
    onError: (e) => toast.error(e.message),
  });
  const setupConfirm = trpc.twoFactor.setupConfirm.useMutation({
    onSuccess: (r) => {
      setBackupCodes(r.backupCodes);
      setShowBackupModal(true);
      setSetupCode("");
      setQrDataUrl(null);
      setOtpauthUrl(null);
      void utils.twoFactor.getStatus.invalidate();
      toast.success("Two-factor authentication enabled");
    },
    onError: (e) => toast.error(e.message),
  });
  const disable = trpc.twoFactor.disable.useMutation({
    onSuccess: () => {
      setDisableCode("");
      void utils.twoFactor.getStatus.invalidate();
      toast.success("Two-factor authentication disabled");
    },
    onError: (e) => toast.error(e.message),
  });
  const regen = trpc.twoFactor.regenerateBackupCodes.useMutation({
    onSuccess: (r) => {
      setBackupCodes(r.backupCodes);
      setShowBackupModal(true);
      setRegenCode("");
      void utils.twoFactor.getStatus.invalidate();
      toast.success("New backup codes generated");
    },
    onError: (e) => toast.error(e.message),
  });

  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [otpauthUrl, setOtpauthUrl] = useState<string | null>(null);
  const [setupCode, setSetupCode] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [regenCode, setRegenCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [showBackupModal, setShowBackupModal] = useState(false);

  const onStartSetup = async () => {
    const r = await setupInitiate.mutateAsync();
    setQrDataUrl(r.qrDataUrl);
    setOtpauthUrl(r.otpauthUrl);
  };

  const onConfirmSetup = () => {
    setupConfirm.mutate({ code: setupCode.trim() });
  };

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading security settings…</p>;
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Two-factor authentication</CardTitle>
          <CardDescription>
            Add a second step after sign-in with Microsoft / Google. You will scan a QR code in an authenticator app
            (Google Authenticator, Authy, etc.).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {status?.enabled ? (
            <div className="space-y-4">
              <p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">2FA is enabled on your account.</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => regen.mutate({ code: regenCode.trim() })}
                  disabled={regen.isPending || regenCode.length < 6}
                >
                  Regenerate backup codes
                </Button>
              </div>
              <div className="space-y-2 max-w-xs">
                <Label htmlFor="regen-code">Authenticator code (for regenerate)</Label>
                <Input
                  id="regen-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="123456"
                  value={regenCode}
                  onChange={(e) => setRegenCode(e.target.value)}
                />
              </div>
              <div className="border-t pt-4 space-y-2 max-w-xs">
                <Label htmlFor="dis-code">Disable — enter authenticator code</Label>
                <div className="flex gap-2 flex-wrap">
                  <Input
                    id="dis-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="123456"
                    value={disableCode}
                    onChange={(e) => setDisableCode(e.target.value)}
                  />
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={disable.isPending || disableCode.length < 6}
                    onClick={() => disable.mutate({ code: disableCode.trim() })}
                  >
                    Disable 2FA
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {status?.hasPendingSetup && !qrDataUrl ? (
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  You have a pending setup — scan the QR again or start over.
                </p>
              ) : null}
              {!qrDataUrl ? (
                <Button onClick={() => void onStartSetup()} disabled={setupInitiate.isPending}>
                  {setupInitiate.isPending ? "Preparing…" : "Set up authenticator"}
                </Button>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row gap-6 items-start">
                    {qrDataUrl ? (
                      <img src={qrDataUrl} alt="Authenticator QR" className="rounded-lg border bg-white p-2 w-48 h-48" />
                    ) : null}
                    <div className="space-y-2 text-sm max-w-md">
                      <p>Scan the QR in your app, then enter the 6-digit code to confirm.</p>
                      {otpauthUrl ? (
                        <p className="break-all text-muted-foreground text-xs">
                          If you cannot scan: <span className="font-mono">{otpauthUrl}</span>
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="space-y-2 max-w-xs">
                    <Label htmlFor="setup-code">Verification code</Label>
                    <Input
                      id="setup-code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="123456"
                      value={setupCode}
                      onChange={(e) => setSetupCode(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={onConfirmSetup}
                      disabled={setupConfirm.isPending || setupCode.trim().length < 6}
                    >
                      Confirm & enable
                    </Button>
                    <Button variant="ghost" onClick={() => { setQrDataUrl(null); setOtpauthUrl(null); setSetupCode(""); }}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showBackupModal} onOpenChange={setShowBackupModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Save your backup codes</DialogTitle>
            <DialogDescription>
              Each code works once if you lose your phone. Store them in a password manager — they will not be shown
              again.
            </DialogDescription>
          </DialogHeader>
          <ul className="font-mono text-sm space-y-1 max-h-48 overflow-y-auto bg-muted p-3 rounded-md">
            {backupCodes?.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <DialogFooter>
            <Button onClick={() => setShowBackupModal(false)}>I have saved them</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
