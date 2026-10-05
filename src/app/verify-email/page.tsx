"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { isValidEmail, EMAIL_INVALID_MESSAGE } from "@/lib/auth/email-validation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { BizLedgerLogo } from "@/components/shared/BizLedgerLogo";
import { LegalFooter } from "@/components/legal/LegalFooter";
import { Icon } from "../../components/ui/Icon";

type VerifyState =
  | { status: "checking" }
  | { status: "success" }
  | { status: "error"; message: string };

function VerifyEmailInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { verifyEmail, sendVerificationEmail } = useAuth();
  const token = searchParams?.get("token") ?? "";
  const callbackURL = searchParams?.get("callbackURL") ?? "";
  const [state, setState] = useState<VerifyState>({ status: "checking" });
  const [resendEmail, setResendEmail] = useState("");
  const [resendError, setResendError] = useState("");
  const [resending, setResending] = useState(false);
  const [resendSent, setResendSent] = useState(false);

  useEffect(() => {
    if (!token) return; // missing-token state is derived at render time below
    let cancelled = false;
    (async () => {
      const result = await verifyEmail({ token, callbackURL: callbackURL || undefined });
      if (cancelled) return;
      if (result.ok) {
        setState({ status: "success" });
      } else {
        setState({ status: "error", message: result.error });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, callbackURL, verifyEmail]);

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    setResendError("");
    if (!isValidEmail(resendEmail)) {
      setResendError(EMAIL_INVALID_MESSAGE);
      return;
    }
    setResending(true);
    const result = await sendVerificationEmail({ email: resendEmail });
    setResending(false);
    if (!result.ok) {
      setResendError(result.error);
      return;
    }
    setResendSent(true);
  };

  const continueTarget =
    callbackURL && /^[/]/.test(callbackURL) ? callbackURL : "/";

  if (state.status === "checking" && token) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <div className="flex-1 flex items-center justify-center px-4 py-12">
          <div className="w-full max-w-md text-center">
            <BizLedgerLogo size="default" />
            <p className="mt-6 text-sm text-outline">Verifying your email…</p>
          </div>
        </div>
        <LegalFooter />
      </div>
    );
  }

  if (state.status === "success") {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <div className="flex-1 flex items-center justify-center px-4 py-12">
          <div className="w-full max-w-md text-center">
            <div className="mb-8 flex flex-col items-center">
              <BizLedgerLogo size="default" />
            </div>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Icon name="verified" className="text-[26px] text-primary" />
            </div>
            <h1 className="text-2xl font-bold">Email verified</h1>
            <p className="mt-2 text-sm text-outline leading-relaxed">
              Your email address has been verified. You can continue to your
              account.
            </p>
            <Button
              type="button"
              variant="primary"
              size="lg"
              className="mt-6 w-full"
              icon="arrow_forward"
              iconPosition="right"
              onClick={() => router.replace(continueTarget)}
            >
              Continue
            </Button>
          </div>
        </div>
        <LegalFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="mb-8 flex flex-col items-center text-center">
            <Link href="/" className="flex items-center gap-2">
              <BizLedgerLogo size="default" />
              <span className="text-xl font-bold tracking-tight">BizLedger</span>
            </Link>
            <h1 className="mt-6 text-2xl font-bold">Couldn&apos;t verify</h1>
            <p className="mt-2 text-sm text-outline leading-relaxed">
              {state.status === "error"
                ? state.message
                : "This verification link is missing a token."}
            </p>
          </div>

          <div className="rounded-xl border border-outline-variant/50 bg-surface-container-lowest p-6 shadow-sm">
            {resendSent ? (
              <div className="text-center">
                <h2 className="text-lg font-semibold">Verification email sent</h2>
                <p className="mt-2 text-sm text-outline leading-relaxed">
                  If an account exists for that address, a fresh verification
                  link (valid for 60 minutes) is on its way.
                </p>
                <Link
                  href="/login"
                  className="mt-4 inline-block text-xs font-semibold text-primary hover:underline"
                >
                  Back to login
                </Link>
              </div>
            ) : (
              <form onSubmit={handleResend}>
                <p className="mb-3 text-sm text-outline">
                  Enter your email address to receive a new verification link.
                </p>
                <Input
                  label="Email address"
                  type="email"
                  placeholder="you@example.com"
                  icon="mail"
                  value={resendEmail}
                  onChange={(e) => setResendEmail(e.target.value)}
                />
                {resendError && (
                  <p className="mt-3 rounded-md bg-error/10 px-3 py-2 text-xs font-medium text-error">
                    {resendError}
                  </p>
                )}
                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  className="mt-4 w-full"
                  loading={resending}
                  icon="refresh"
                  iconPosition="right"
                >
                  Resend verification link
                </Button>
              </form>
            )}
          </div>

          <p className="mt-4 text-center text-xs text-outline">
            <Link href="/login" className="font-semibold text-primary hover:underline">
              Back to login
            </Link>
          </p>
        </div>
      </div>
      <LegalFooter />
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailInner />
    </Suspense>
  );
}