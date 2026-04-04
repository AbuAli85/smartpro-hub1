import { useState, useRef, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { CheckCircle2, FileText, PenLine, XCircle, AlertTriangle, RefreshCw } from "lucide-react";

// ─── Signature Canvas ─────────────────────────────────────────────────────────

function SignatureCanvas({ onCapture }: { onCapture: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [mode, setMode] = useState<"draw" | "type">("draw");
  const [typedName, setTypedName] = useState("");

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isDrawing) return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    setHasDrawn(true);
  };

  const stopDraw = () => setIsDrawing(false);

  const clear = () => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  const confirm = () => {
    if (mode === "draw") {
      if (!hasDrawn) return toast.error("Please draw your signature first");
      const canvas = canvasRef.current!;
      onCapture(canvas.toDataURL("image/png"));
    } else {
      if (!typedName.trim()) return toast.error("Please type your name");
      // Render typed name to canvas
      const canvas = canvasRef.current!;
      const ctx = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.font = "italic 36px Georgia, serif";
      ctx.fillStyle = "#1e293b";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(typedName, canvas.width / 2, canvas.height / 2);
      onCapture(canvas.toDataURL("image/png"));
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Button variant={mode === "draw" ? "default" : "outline"} size="sm" onClick={() => setMode("draw")} className="gap-1">
          <PenLine size={13} /> Draw
        </Button>
        <Button variant={mode === "type" ? "default" : "outline"} size="sm" onClick={() => setMode("type")} className="gap-1">
          <FileText size={13} /> Type
        </Button>
      </div>

      {mode === "draw" ? (
        <div className="border-2 border-dashed border-border rounded-lg overflow-hidden bg-background">
          <canvas
            ref={canvasRef}
            width={500}
            height={150}
            className="w-full touch-none cursor-crosshair"
            onMouseDown={startDraw}
            onMouseMove={draw}
            onMouseUp={stopDraw}
            onMouseLeave={stopDraw}
            onTouchStart={startDraw}
            onTouchMove={draw}
            onTouchEnd={stopDraw}
          />
          <p className="text-xs text-center text-muted-foreground py-1 border-t">Sign above using mouse or finger</p>
        </div>
      ) : (
        <div className="space-y-2">
          <Input
            placeholder="Type your full legal name"
            value={typedName}
            onChange={e => setTypedName(e.target.value)}
            className="text-lg font-serif italic"
          />
          <canvas ref={canvasRef} width={500} height={150} className="hidden" />
        </div>
      )}

      <div className="flex gap-2">
        {mode === "draw" && (
          <Button variant="outline" size="sm" onClick={clear}>Clear</Button>
        )}
        <Button size="sm" onClick={confirm} className="gap-1">
          <CheckCircle2 size={13} /> Confirm Signature
        </Button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ContractSignPage() {
  const { id } = useParams<{ id: string }>();
  const contractId = Number(id);
  const { user, isAuthenticated } = useAuth();
  const authLoading = !isAuthenticated && user === null;
  const [, navigate] = useLocation();
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [signed, setSigned] = useState(false);
  const [declined, setDeclined] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [showDeclineForm, setShowDeclineForm] = useState(false);

  const { data: contract, isLoading: contractLoading } = trpc.contracts.getById.useQuery(
    { id: contractId },
    { enabled: !!contractId && !isNaN(contractId) }
  );

  const { data: signers, refetch: refetchSigners } = trpc.contracts.listSigners.useQuery(
    { contractId },
    { enabled: !!contractId && !isNaN(contractId) }
  );

  // Find the signer record for the current user
  const mySigner = signers?.find(s => s.signerEmail === user?.email);

  const submitSignature = trpc.contracts.submitSignature.useMutation({
    onSuccess: () => {
      toast.success("Contract signed successfully!");
      setSigned(true);
      refetchSigners();
    },
    onError: (e) => toast.error(e.message),
  });

  const declineSignature = trpc.contracts.declineSignature.useMutation({
    onSuccess: () => {
      toast.info("Signature declined.");
      setDeclined(true);
      refetchSigners();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSign = () => {
    if (!signatureDataUrl) return toast.error("Please draw or type your signature first");
    if (!mySigner) return toast.error("You are not listed as a signer for this contract");
    submitSignature.mutate({
      signatureId: mySigner.id,
      signatureDataUrl,
      ipAddress: undefined,
    });
  };

  const handleDecline = () => {
    if (!mySigner) return;
    declineSignature.mutate({ signatureId: mySigner.id, reason: declineReason });
  };

  if (authLoading || contractLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="text-center space-y-3">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground text-sm">Loading contract...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="py-10 text-center space-y-4">
            <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto" />
            <h2 className="text-lg font-semibold">Authentication Required</h2>
            <p className="text-sm text-muted-foreground">You must be logged in to sign this contract.</p>
            <Button onClick={() => navigate("/")}>Go to Login</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!contract) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="py-10 text-center space-y-4">
            <XCircle className="w-10 h-10 text-red-500 mx-auto" />
            <h2 className="text-lg font-semibold">Contract Not Found</h2>
            <p className="text-sm text-muted-foreground">This contract does not exist or you don't have access.</p>
            <Button variant="outline" onClick={() => navigate("/contracts")}>Back to Contracts</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const alreadySigned = mySigner?.status === "signed";
  const alreadyDeclined = mySigner?.status === "declined";

  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-1">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
            <FileText className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">Contract Signature Request</h1>
          <p className="text-muted-foreground text-sm">SmartPRO Business Services Hub</p>
        </div>

        {/* Contract Info */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText size={16} />
              {contract.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wide mb-0.5">Contract #</p>
                <p className="font-medium">{contract.contractNumber}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wide mb-0.5">Type</p>
                <p className="font-medium capitalize">{contract.type?.replace(/_/g, " ")}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wide mb-0.5">Status</p>
                <Badge className={`text-xs ${contract.status === "signed" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}`}>
                  {contract.status?.replace(/_/g, " ")}
                </Badge>
              </div>
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wide mb-0.5">Value</p>
                <p className="font-medium">{contract.value ? `OMR ${Number(contract.value).toFixed(3)}` : "—"}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Signers Status */}
        {signers && signers.length > 0 && (
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-muted-foreground uppercase tracking-wide">Signers</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {signers.map(s => (
                <div key={s.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <p className="text-sm font-medium">{s.signerName}</p>
                    <p className="text-xs text-muted-foreground">{s.signerEmail}</p>
                  </div>
                  <Badge className={`text-xs ${
                    s.status === "signed" ? "bg-green-100 text-green-700" :
                    s.status === "declined" ? "bg-red-100 text-red-700" :
                    "bg-amber-100 text-amber-700"
                  }`}>
                    {s.status === "signed" ? "✓ Signed" : s.status === "declined" ? "✗ Declined" : "Pending"}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Signing Area */}
        {(signed || alreadySigned) ? (
          <Card className="border-0 shadow-sm border-l-4 border-l-green-500">
            <CardContent className="py-8 text-center space-y-3">
              <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
              <h2 className="text-lg font-semibold text-green-700">Contract Signed</h2>
              <p className="text-sm text-muted-foreground">
                Your signature has been recorded. You will receive a copy once all parties have signed.
              </p>
              <Button variant="outline" size="sm" onClick={() => navigate("/contracts")}>
                View All Contracts
              </Button>
            </CardContent>
          </Card>
        ) : (declined || alreadyDeclined) ? (
          <Card className="border-0 shadow-sm border-l-4 border-l-red-500">
            <CardContent className="py-8 text-center space-y-3">
              <XCircle className="w-12 h-12 text-red-500 mx-auto" />
              <h2 className="text-lg font-semibold text-red-700">Signature Declined</h2>
              <p className="text-sm text-muted-foreground">
                You have declined to sign this contract. The requester has been notified.
              </p>
              <Button variant="outline" size="sm" onClick={() => navigate("/")}>
                Return Home
              </Button>
            </CardContent>
          </Card>
        ) : !mySigner ? (
          <Card className="border-0 shadow-sm">
            <CardContent className="py-8 text-center space-y-3">
              <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto" />
              <h2 className="text-base font-semibold">Not Listed as Signer</h2>
              <p className="text-sm text-muted-foreground">
                Your email ({user.email}) is not listed as a required signer for this contract.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <PenLine size={16} />
                Your Signature
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Signing as: <strong>{mySigner.signerName}</strong> ({mySigner.signerEmail})
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {!signatureDataUrl ? (
                <SignatureCanvas onCapture={setSignatureDataUrl} />
              ) : (
                <div className="space-y-3">
                  <div className="border rounded-lg overflow-hidden bg-background">
                    <img src={signatureDataUrl} alt="Your signature" className="w-full max-h-36 object-contain" />
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setSignatureDataUrl(null)}>
                      Redo Signature
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSign}
                      disabled={submitSignature.isPending}
                      className="gap-1 bg-green-600 hover:bg-green-700"
                    >
                      {submitSignature.isPending ? (
                        <><RefreshCw size={13} className="animate-spin" /> Signing...</>
                      ) : (
                        <><CheckCircle2 size={13} /> Sign Contract</>
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {/* Legal notice */}
              <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground">
                <p className="font-medium mb-1">Legal Notice</p>
                <p>
                  By signing this contract, you agree to be legally bound by its terms and conditions.
                  Your electronic signature is legally equivalent to a handwritten signature under applicable law.
                  The timestamp, IP address, and user identity will be recorded for audit purposes.
                </p>
              </div>

              {/* Decline option */}
              {!showDeclineForm ? (
                <button
                  className="text-xs text-red-500 hover:underline"
                  onClick={() => setShowDeclineForm(true)}
                >
                  Decline to sign this contract
                </button>
              ) : (
                <div className="border border-red-200 rounded-lg p-3 space-y-2">
                  <p className="text-sm font-medium text-red-700">Decline Signature</p>
                  <div className="space-y-1">
                    <Label className="text-xs">Reason (optional)</Label>
                    <Input
                      placeholder="Reason for declining..."
                      value={declineReason}
                      onChange={e => setDeclineReason(e.target.value)}
                      className="text-sm"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setShowDeclineForm(false)}>Cancel</Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleDecline}
                      disabled={declineSignature.isPending}
                    >
                      {declineSignature.isPending ? "Declining..." : "Confirm Decline"}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
