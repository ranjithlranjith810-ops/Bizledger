"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { googleButtonVisible } from "@/lib/auth/oauth-config";
import { Button } from "@/components/ui/Button";
import { Icon } from "../ui/Icon";

// Public-only flag: NEXT_PUBLIC_* embeds a plain boolean in the client bundle.
// Google credentials NEVER appear here — they live only in the server env and
// are read by src/lib/auth.ts.
const googleEnabled = googleButtonVisible(process.env.NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED);

// "Continue with Google" entry point for the login/signup pages.
//
// Success always lands on the home page ("/"), which decides the destination
// from the server-confirmed business resolution (dashboard for existing users,
// the onboarding wizard for fresh accounts). On a provider cancel/error the
// caller-provided errorCallbackURL returns the user to the page they started on.
export function GoogleSignInButton({
  errorCallbackURL = "/login",
}: {
  errorCallbackURL?: string;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!googleEnabled) return null;

  const handleClick = async () => {
    setError("");
    setBusy(true);
    try {
      const res = await authClient.signIn.social({
        provider: "google",
        callbackURL: "/",
        errorCallbackURL,
      });
      // A successful social start redirects the browser away; reaching this
      // line means the provider route rejected the request locally.
      if (res.error) {
        setBusy(false);
        setError(res.error.message ?? "Google sign-in failed. Please try again.");
      }
    } catch {
      setBusy(false);
      setError("Google sign-in failed. Please try again.");
    }
  };

  return (
    <div>
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="mt-5 w-full focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:border-primary"
        disabled={busy}
        onClick={handleClick}
      >
        {/* Centered horizontal group: fixed 16x16 leading slot that swaps the
            Google G <-> spinner in place, plus a single-line label. The group is
            a flex row (8px gap) centered by the button's own flex centering, and
            the SVG renders as a block so no text baseline can shift it. */}
        <span className="flex items-center justify-center gap-2">
          <span className="flex h-4 w-4 shrink-0 items-center justify-center">
            {busy ? (
              <Icon name="progress_activity" className="h-4 w-4 animate-spin text-[16px] leading-none" aria-hidden="true" />
            ) : (
              <GoogleG />
            )}
          </span>
          <span className="leading-none whitespace-nowrap">Continue with Google</span>
        </span>
      </Button>
      {error && (
        <p className="mt-3 rounded-md bg-error/10 px-3 py-2 text-xs font-medium text-error">
          {error}
        </p>
      )}
    </div>
  );
}

function GoogleG() {
  return (
    <svg viewBox="0 0 48 48" className="block h-4 w-4 shrink-0" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}