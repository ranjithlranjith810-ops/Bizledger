"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { isValidEmail, EMAIL_INVALID_MESSAGE } from "@/lib/auth/email-validation";
import { googleButtonVisible } from "@/lib/auth/oauth-config";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { BizLedgerLogo } from "@/components/shared/BizLedgerLogo";
import { LegalFooter } from "@/components/legal/LegalFooter";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { Icon } from "../../components/ui/Icon";

const googleEnabled = googleButtonVisible(process.env.NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED);

export default function LoginPage() {
  const router = useRouter();
  const { login, account } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email.trim() || !password) {
      setError("Please enter your email address and password.");
      return;
    }
    if (!isValidEmail(email)) {
      setError(EMAIL_INVALID_MESSAGE);
      return;
    }
    setSubmitting(true);
    const result = await login({ email, password });
    if (!result.ok) {
      setSubmitting(false);
      setError(result.error);
      return;
    }
    // Route through the home page, which decides the destination from the
    // SERVER-CONFIRMED business resolution (Providers) rather than a snapshot
    // taken before the session settles — so an existing onboarded user is never
    // sent into the onboarding wizard on a stale `onboarding.completed`.
    router.replace("/");
  };

  return (
    // One flex column owning the whole visible viewport, so the entire
    // composition (logo -> heading -> card -> legal row) centres on the real
    // viewport axis instead of on the space left over beside a full-width
    // footer band. `dvh` rather than `vh` so mobile browser chrome is excluded
    // — `100vh` includes the area behind dynamic toolbars, which strands the
    // form low and leaves phantom dead space beneath it. `my-auto` rather than
    // `justify-center` so that when the content is genuinely taller than a
    // short viewport (320px) it stays scrollable from the top instead of
    // overflowing out of reach above the edge.
    <div className="flex min-h-dvh flex-col bg-background px-4 py-8 sm:px-6 sm:py-10">
      <div className="mx-auto my-auto w-full max-w-md">
        {/* Vertical rhythm: every gap BETWEEN the four units of the composition
            (logo-lockup, heading+subtitle, card, legal row) is the same 16px,
            and the heading keeps its one tight 8px pair with its subtitle.
            Previously the gaps ran 24 / 8 / 32 / 32, so the logo sat FURTHER
            from the heading than the heading sat from the card — the card read
            as detached and the whole composition read as unbalanced. A single
            scale applied by role, not by taste. The centring itself was already
            exact (0px off the viewport axis) and is left untouched. */}
        <div className="mb-4 flex flex-col items-center text-center">
          <Link href="/" className="flex items-center gap-2">
            <BizLedgerLogo size="default" />
            <span className="text-xl font-bold tracking-tight">BizLedger</span>
          </Link>
          <h1 className="mt-4 text-2xl font-bold">Welcome back</h1>
          <p className="mt-2 text-sm text-outline">Log in to resume your business ledger.</p>
        </div>

        <div className="rounded-xl border border-outline-variant/50 bg-surface-container-lowest p-6 shadow-sm">
          <GoogleSignInButton errorCallbackURL="/login" />
          {googleEnabled && (
            <div className="mt-5 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-wider text-outline">
              <span className="h-px flex-1 bg-outline-variant/50" />
              or
              <span className="h-px flex-1 bg-outline-variant/50" />
            </div>
          )}
          <form onSubmit={handleSubmit}>
            <Input
              label="Email address"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              icon="mail"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <Input
              label="Password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="••••••••"
              icon="lock"
              className="mt-4"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              rightElement={
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  className="flex h-full items-center justify-center p-2 text-outline hover:text-on-surface transition-colors"
                >
                  <Icon name={showPassword ? "visibility_off" : "visibility"} className="text-[18px] select-none" />
                </button>
              }
            />

            {error && (
              <p className="mt-3 rounded-md bg-error/10 px-3 py-2 text-xs font-medium text-error">
                {error}
              </p>
            )}

            <div className="mt-3 text-right">
              <Link
                href="/forgot-password"
                className="text-xs font-semibold text-primary hover:underline"
              >
                Forgot password?
              </Link>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="mt-5 w-full"
              loading={submitting}
              icon="login"
              iconPosition="right"
            >
              Log in
            </Button>

            <p className="mt-4 text-center text-xs text-outline">
              New to BizLedger?{" "}
              <Link href="/signup" className="font-semibold text-primary hover:underline">
                Create an account
              </Link>
            </p>
            {account && (
              <p className="mt-3 text-center text-xs text-outline">
                Currently signed in as{" "}
                <span className="font-semibold text-on-surface">{account.email}</span>
              </p>
            )}
          </form>
        </div>

        {/* Centred on the same axis as the card, directly beneath it. */}
        <LegalFooter variant="compact" />
      </div>
    </div>
  );
}
