"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth, INVALID_RESET_LINK_MESSAGE } from "@/context/AuthContext";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { BizLedgerLogo } from "@/components/shared/BizLedgerLogo";
import { LegalFooter } from "@/components/legal/LegalFooter";
import { Icon } from "../../../components/ui/Icon";

export default function ResetPasswordPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const { resetPassword } = useAuth();
  const token = typeof params?.token === "string" ? params.token : "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const linkExpired = error === INVALID_RESET_LINK_MESSAGE;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError("");
    if (!token) {
      setError("This reset link is invalid — please request a new one.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    const result = await resetPassword({ token, newPassword: password });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.replace("/login");
  };

  if (!token) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <div className="flex-1 flex items-center justify-center px-4 py-12">
          <div className="w-full max-w-md text-center">
            <div className="mb-8 flex flex-col items-center">
              <BizLedgerLogo size="default" />
            </div>
            <h1 className="text-2xl font-bold">Invalid reset link</h1>
            <p className="mt-2 text-sm text-outline leading-relaxed">
              This password reset link is missing or malformed. Please request a
              new one from the forgot-password page.
            </p>
            <Link
              href="/forgot-password"
              className="mt-6 inline-block font-semibold text-primary hover:underline"
            >
              Request a new reset link
            </Link>
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
            <h1 className="mt-6 text-2xl font-bold">Choose a new password</h1>
            <p className="mt-2 text-sm text-outline">
              Your reset link is valid for one use.
            </p>
          </div>

          <div className="rounded-xl border border-outline-variant/50 bg-surface-container-lowest p-6 shadow-sm">
            <form onSubmit={handleSubmit}>
              <Input
                label="New password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                placeholder="••••••••"
                icon="lock"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                rightElement={
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="flex items-center justify-center p-1 text-outline hover:text-on-surface transition-colors"
                  >
                    <Icon name={showPassword ? "visibility_off" : "visibility"} className="text-[18px] select-none" />
                  </button>
                }
              />

              <Input
                label="Confirm new password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                placeholder="••••••••"
                icon="lock"
                className="mt-4"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />

              {error && (
                <p className="mt-3 rounded-md bg-error/10 px-3 py-2 text-xs font-medium text-error">
                  {error}
                </p>
              )}

              {linkExpired && (
                <p className="mt-3 rounded-md bg-surface-variant/50 px-3 py-2 text-xs text-outline">
                  Reset links are single-use and expire after an hour. If this link
                  looks correct, it may already be used.{" "}
                  <Link
                    href="/forgot-password"
                    className="font-semibold text-primary hover:underline"
                  >
                    Request a new password-reset email
                  </Link>
                </p>
              )}

              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="mt-5 w-full"
                loading={submitting}
                icon="key"
                iconPosition="right"
              >
                Update password
              </Button>

              <p className="mt-4 text-center text-xs text-outline">
                <Link href="/login" className="font-semibold text-primary hover:underline">
                  Back to login
                </Link>
              </p>
            </form>
          </div>
        </div>
      </div>
      <LegalFooter />
    </div>
  );
}