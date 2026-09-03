"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useApp } from "@/context/AppContext";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { BizLedgerLogo } from "@/components/shared/BizLedgerLogo";
import { LegalFooter } from "@/components/legal/LegalFooter";

export default function LoginPage() {
  const router = useRouter();
  const { login, account } = useAuth();
  const { onboarding } = useApp();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email.trim()) {
      setError("Please enter the email you signed up with.");
      return;
    }
    setSubmitting(true);
    const ok = login(email);
    if (!ok) {
      setSubmitting(false);
      setError("No account found with this email. Please create an account first.");
      return;
    }
    // Resume the onboarding wizard if the account never finished setup.
    if (onboarding && onboarding.completed) {
      router.replace("/dashboard");
    } else {
      router.replace("/onboarding");
    }
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
          <h1 className="mt-6 text-2xl font-bold">Welcome back</h1>
          <p className="mt-2 text-sm text-outline">
            Log in to resume your business ledger.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-outline-variant/50 bg-surface-container-lowest p-6 shadow-sm"
        >
          <Input
            label="Email address"
            type="email"
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
      </div>
      <LegalFooter />
    </div>
  );
}
