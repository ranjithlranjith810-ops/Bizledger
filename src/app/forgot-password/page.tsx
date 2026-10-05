"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { isValidEmail, EMAIL_INVALID_MESSAGE } from "@/lib/auth/email-validation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { BizLedgerLogo } from "@/components/shared/BizLedgerLogo";
import { LegalFooter } from "@/components/legal/LegalFooter";
import { Icon } from "../../components/ui/Icon";

export default function ForgotPasswordPage() {
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }
    if (!isValidEmail(email)) {
      setError(EMAIL_INVALID_MESSAGE);
      return;
    }
    setSubmitting(true);
    const result = await requestPasswordReset({ email });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSent(true);
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="mb-8 flex flex-col items-center text-center">
            <Link href="/" className="flex items-center gap-2">
              <BizLedgerLogo size="default" />
              <span className="text-xl font-bold tracking-tight">BizLedger</span>
            </Link>
            <h1 className="mt-6 text-2xl font-bold">Reset your password</h1>
            <p className="mt-2 text-sm text-outline">
              We&apos;ll email you a secure link to choose a new password.
            </p>
          </div>

          <div className="rounded-xl border border-outline-variant/50 bg-surface-container-lowest p-6 shadow-sm">
            {sent ? (
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <Icon name="mail" className="text-[26px] text-primary" />
                </div>
                <h2 className="text-lg font-semibold">Check your email</h2>
                <p className="mt-2 text-sm text-outline leading-relaxed">
                  If an account exists for that address, a password reset link
                  is on its way. The link expires in 60 minutes and can be used
                  only once.
                </p>
                <p className="mt-4 text-xs text-outline">
                  Didn&apos;t get it? Check your spam folder, then{" "}
                  <button
                    type="button"
                    className="font-semibold text-primary hover:underline"
                    onClick={() => {
                      setSent(false);
                      setEmail("");
                    }}
                  >
                    try again
                  </button>
                  .
                </p>
              </div>
            ) : (
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

                {error && (
                  <p className="mt-3 rounded-md bg-error/10 px-3 py-2 text-xs font-medium text-error">
                    {error}
                  </p>
                )}

                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  className="mt-5 w-full"
                  loading={submitting}
                  icon="mail"
                  iconPosition="right"
                >
                  Send reset link
                </Button>

                <p className="mt-4 text-center text-xs text-outline">
                  Remembered your password?{" "}
                  <Link
                    href="/login"
                    className="font-semibold text-primary hover:underline"
                  >
                    Back to login
                  </Link>
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
      <LegalFooter />
    </div>
  );
}