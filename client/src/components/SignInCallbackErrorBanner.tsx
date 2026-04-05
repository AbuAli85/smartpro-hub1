import { useMemo, useState } from "react";
import { useSearch } from "wouter";
import { AlertCircle, X } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

const MESSAGES: Record<string, { title: string; description: string }> = {
  oauth_callback: {
    title: "Sign-in did not complete",
    description:
      "Try again below. If it keeps failing, use the same sign-in option (Microsoft, Google, email, etc.) you used when you first created your account.",
  },
  oauth_incomplete: {
    title: "Sign-in was cancelled or interrupted",
    description: "Close any extra tabs and start sign-in again from SmartPRO.",
  },
};

function parseSignInErrorCode(search: string): string | null {
  const q = search.startsWith("?") ? search.slice(1) : search;
  return new URLSearchParams(q).get("signin_error");
}

function stripSigninErrorFromUrl() {
  const p = new URLSearchParams(window.location.search);
  if (!p.has("signin_error")) return;
  p.delete("signin_error");
  const next = window.location.pathname + (p.toString() ? `?${p}` : "") + window.location.hash;
  window.history.replaceState(null, "", next);
}

/**
 * Shows when the app URL contains ?signin_error=… (set by /api/oauth/callback on failure).
 */
export function SignInCallbackErrorBanner() {
  const search = useSearch();
  const code = useMemo(() => parseSignInErrorCode(search), [search]);
  const [dismissed, setDismissed] = useState(false);

  if (!code || dismissed) return null;

  const copy = MESSAGES[code] ?? {
    title: "Sign-in issue",
    description: "Try signing in again. Use the same provider you used when you first registered.",
  };

  return (
    <Alert variant="destructive" className="text-left relative pr-10 border-destructive/50">
      <AlertCircle className="size-4" />
      <AlertTitle>{copy.title}</AlertTitle>
      <AlertDescription>{copy.description}</AlertDescription>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute right-2 top-2 h-8 w-8 text-destructive hover:text-destructive"
        aria-label="Dismiss"
        onClick={() => {
          setDismissed(true);
          stripSigninErrorFromUrl();
        }}
      >
        <X className="size-4" />
      </Button>
    </Alert>
  );
}
