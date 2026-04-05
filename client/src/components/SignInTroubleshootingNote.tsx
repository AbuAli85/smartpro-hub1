import { cn } from "@/lib/utils";

/**
 * Shown next to SmartPRO sign-in entry points. The hosted IdP (e.g. Manus) may reject
 * Microsoft/Google/etc. if that email was first registered with another provider — that
 * happens on the IdP domain before our /api/oauth/callback runs.
 */
export function SignInTroubleshootingNote({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border/80 bg-muted/30 px-3 py-2.5 text-left text-xs text-muted-foreground leading-relaxed",
        className,
      )}
    >
      <p>
        <span className="font-medium text-foreground/90">Sign-in tip:</span> use the{" "}
        <strong className="text-foreground/80">same sign-in option</strong> you used when you first created your account
        (for example Microsoft vs Google vs email). If the login page says your email is already registered with another
        sign-in method, return here and choose your <strong className="text-foreground/80">original</strong> provider,
        or ask your administrator to help. SmartPRO cannot merge providers on that screen.
      </p>
    </div>
  );
}
