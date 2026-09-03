"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { BizLedgerLogo } from "@/components/shared/BizLedgerLogo";

export default function SignupPage() {
  const router = useRouter();
  const { createAccount, isAuthenticated } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!name.trim() || !email.trim()) {
      setError("Please enter your name and email address.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Please enter a valid email address.");
      return;
    }
    setSubmitting(true);
    createAccount({ name, email, businessName });
    // New accounts enter the business onboarding wizard (never straight to the
    // dashboard). The wizard will open on its first step.
    router.replace("/onboarding");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <Link href="/" className="flex items-center gap-2">
            <BizLedgerLogo size="default" />
            <span className="text-xl font-bold tracking-tight">BizLedger</span>
          </Link>
          <h1 className="mt-6 text-2xl font-bold">Create your account</h1>
          <p className="mt-2 text-sm text-outline">
            Start with a fresh, zero-value business ledger.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-outline-variant/50 bg-surface-container-lowest p-6 shadow-sm"
        >
          <div className="space-y-4">
            <Input
              label="Your name"
              placeholder="e.g. Ramesh Kumar"
              icon="person"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Input
              label="Email address"
              type="email"
              placeholder="you@example.com"
              icon="mail"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Input
              label="Business name (optional)"
              placeholder="e.g. Ramesh Furniture Works"
              icon="storefront"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
            />
          </div>

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
            icon={isAuthenticated ? undefined : "arrow_forward"}
            iconPosition="right"
          >
            {isAuthenticated ? "Continue" : "Create account & open app"}
          </Button>

          <p className="mt-4 text-center text-xs text-outline">
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-primary hover:underline">
              Log in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
