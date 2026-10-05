"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import { ArrowLeft, Lock, CreditCard, Loader2, ShieldCheck } from "lucide-react";
import { formatINRString, planLabel } from "@/lib/billing";
import { billingApi, PaidCheckout, FreeCheckout } from "@/lib/api/billing";
import {
  buildRazorpayOptions,
  loadRazorpayCheckoutScript,
  openRazorpayCheckout,
  reduceCheckoutPhase,
  serverOrderAmounts,
  shouldLaunchPaidCheckout,
  CheckoutPhase,
  CheckoutEvent,
} from "@/lib/razorpay-checkout";

export const PaymentView: React.FC = () => {
  const { plans, pendingPlanId, pendingPeriod, activeBusinessId, companyProfile } = useApp();
  const { account } = useAuth();
  const router = useRouter();

  const plan = plans.find((p) => p.id === pendingPlanId);
  const period = pendingPeriod ?? "month";

  const [checkout, setCheckout] = useState<PaidCheckout | FreeCheckout | null>(null);
  const [phase, setPhase] = useState<CheckoutPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const settledRef = useRef(false);

  const go = (event: CheckoutEvent) => {
    setPhase((prev) => reduceCheckoutPhase(prev, event));
  };

  // Fetches the secure checkout server-side (Phase 4D reuse protects accidental
  // doubles). PURE: never touches state, so both the mount effect and the
  // "Load Checkout Again" button can call it and only then update state
  // (react-hooks/set-state-in-effect only forbids SYNCHRONOUS setState in the
  // effect body — the awaits below keep every state write on the async path).
  const fetchCheckout = useCallback(async () => {
    if (!plan || !activeBusinessId) return null;
    const res = await billingApi.createCheckout(
      activeBusinessId,
      plan.id,
      period,
    );
    return res.checkout;
  }, [plan, activeBusinessId, period]);

  useEffect(() => {
    if (!plan?.id || !activeBusinessId) return;
    let active = true;
    (async () => {
      try {
        const checkout = await fetchCheckout();
        if (!active || !checkout) return;
        setError(null);
        go("create");
        setCheckout(checkout);
        go("checkout");
      } catch (e) {
        if (!active) return;
        const msg =
          e && typeof e === "object" && "message" in e
            ? String((e as { message: unknown }).message)
            : "Could not start checkout.";
        setError(msg);
        go("error");
      }
    })();
    return () => {
      active = false;
    };
  }, [plan?.id, period, activeBusinessId, fetchCheckout]);

  if (!plan) {
    return (
      <div className="space-y-6">
        <div className="bg-white p-8 rounded-2xl border border-[#eceef0] shadow-xs text-center">
          <h2 className="text-lg font-bold text-[#191c1e]">No plan selected</h2>
          <p className="text-xs text-gray-500 mt-2">
            Return to the pricing page and choose a plan first.
          </p>
          <button
            onClick={() => router.push("/pricing")}
            className="mt-4 inline-flex items-center gap-1.5 bg-[#93000b] hover:bg-[#770008] text-white px-5 py-2.5 rounded-xl text-xs font-bold transition-colors"
          >
            Back to Pricing Plans
          </button>
        </div>
      </div>
    );
  }

  const isFree = plan.id === "base";
  const amounts = checkout ? serverOrderAmounts(checkout) : null;
  const canPay =
    !!checkout &&
    shouldLaunchPaidCheckout(checkout) &&
    phase === "ready";
  const retryable = phase === "failed" || phase === "cancelled";

  const description = `${planLabel(plan.name)} — ${period === "month" ? "1 Month" : "1 Year (2 months free)"} subscription`;

  const prefill = {
    name: account?.name ?? undefined,
    email: account?.email ?? undefined,
    contact: companyProfile?.mobile || undefined,
  };

  const handlePay = async () => {
    if (!checkout) return;
    if (!shouldLaunchPaidCheckout(checkout)) {
      setError("Online payment is not available for this selection.");
      return;
    }
    if (phase !== "ready") return; // double-launch guard
    go("open");
    let RazorpayCtor;
    try {
      await loadRazorpayCheckoutScript();
      RazorpayCtor =
        typeof window !== "undefined" ? window.Razorpay : undefined;
    } catch {
      setError("The payment window could not be loaded. Please try again.");
      go("error");
      return;
    }
    if (!RazorpayCtor) {
      setError("Online payment is not available right now. Please try again later.");
      go("error");
      return;
    }
    settledRef.current = false;
    const onErrorEvent = () => {
      if (settledRef.current) return;
      go("error");
      setNotice("Payment failed. No subscription change was made — you can try again.");
    };
    const onCloseEvent = () => {
      if (settledRef.current) return;
      go("dismiss");
      setNotice("Payment cancelled. No charge was made — you can try again when ready.");
    };

    const options = buildRazorpayOptions(
      checkout,
      description,
      (payload) => {
        if (settledRef.current) return;
        settledRef.current = true;
        go("success");
        void (async () => {
          try {
            const res = await billingApi.verifyPayment(payload);
            go("verified");
            const qs = new URLSearchParams({
              planId: plan.id,
              period,
              orderId: res.orderId,
              paymentId: res.paymentId,
              total: checkout.totalAmount,
            });
            router.push(`/payment/success?${qs.toString()}`);
          } catch {
            go("verify-error");
            setNotice(
              "Payment verified by the bank, but confirmation could not be stored right now. Keep your payment reference and check Billing History shortly.",
            );
          }
        })();
      },
      onErrorEvent,
      prefill,
    );

    openRazorpayCheckout(RazorpayCtor, options, {
      onError: onErrorEvent,
      onClose: onCloseEvent,
    });
  };

  const handleCancel = () => {
    if (phase === "opening" || phase === "verifying") return;
    router.push("/pricing/checkout");
  };

  const statusLabel =
    phase === "creating"
      ? "Preparing secure checkout…"
      : phase === "opening"
      ? "Opening Razorpay…"
      : phase === "verifying"
      ? "Verifying payment…"
      : null;

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#191c1e] tracking-tight">Payment</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Pay securely for the {planLabel(plan.name)} plan in Razorpay Test Mode. No real
            money is charged.
          </p>
        </div>
        <button
          onClick={handleCancel}
          className="flex items-center gap-1.5 bg-white hover:bg-[#f7f9fb] text-gray-700 border border-[#eceef0] px-4 py-2.5 rounded-xl text-xs font-bold shadow-xs transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Checkout</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Secure Razorpay Checkout */}
        <div className="lg:col-span-3 space-y-4">
          <div className="bg-white p-6 rounded-2xl border border-[#eceef0] shadow-xs">
            <div className="flex items-center gap-2 mb-4">
              <CreditCard className="w-4 h-4 text-[#93000b]" />
              <h3 className="text-sm font-bold text-[#191c1e]">Razorpay Secure Checkout</h3>
            </div>
            <div className="rounded-xl border border-[#eceef0] bg-[#fafbfc] p-4 text-xs text-gray-600 space-y-2.5">
              <div className="flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  Clicking <span className="font-bold text-gray-900">Pay Securely</span> opens the
                  Razorpay payment window (UPI, cards, net banking, wallets).
                </span>
              </div>
              <div className="flex items-start gap-2.5">
                <Lock className="w-4 h-4 text-[#93000b] shrink-0 mt-0.5" />
                <span>
                  The amount and order are prepared by the server. Your subscription activates
                  only after payment verification is confirmed.
                </span>
              </div>
              <p className="text-[11px] text-gray-400">
                Payments are processed by our payment partner. In Razorpay Test Mode,
                Razorpay test card / UPI credentials can be used.
              </p>
            </div>
          </div>

          {(notice || error) && (
            <div
              className={`rounded-xl border px-4 py-3 text-xs font-medium ${
                error
                  ? "border-rose-200 bg-rose-50 text-[#93000b]"
                  : "border-amber-200 bg-amber-50 text-amber-800"
              }`}
            >
              {error ?? notice}
            </div>
          )}
        </div>

        {/* Pay summary */}
        <div className="lg:col-span-2">
          <div className="bg-white p-6 rounded-2xl border border-[#eceef0] shadow-xs sticky top-6">
            <h3 className="text-sm font-bold text-[#191c1e] mb-4">Amount Due</h3>
            <div className="space-y-2.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Base amount</span>
                <span className="text-xs font-mono font-bold text-gray-900">
                  {amounts ? formatINRString(amounts.base) : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">GST (18%)</span>
                <span className="text-xs font-mono font-bold text-gray-900">
                  {amounts ? formatINRString(amounts.gst) : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Billing</span>
                <span className="text-xs font-medium text-gray-700 capitalize">{period}</span>
              </div>
              <div className="pt-3 border-t border-[#eceef0] flex items-center justify-between">
                <span className="text-xs font-bold text-gray-900">Total to pay</span>
                <span className="text-lg font-bold font-mono text-[#93000b]">
                  {amounts ? formatINRString(amounts.total) : "—"}
                </span>
              </div>
            </div>

            {isFree ? (
              <span className="mt-6 w-full inline-flex items-center justify-center bg-gray-100 text-gray-500 py-3 rounded-xl text-xs font-bold">
                Base plan is free — no payment required
              </span>
            ) : (
              <button
                onClick={() => void handlePay()}
                disabled={!canPay}
                className="mt-6 w-full bg-[#93000b] hover:bg-[#770008] text-white py-3 rounded-xl text-xs font-bold transition-colors shadow-xs flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {phase === "creating" || phase === "opening" || phase === "verifying" ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {statusLabel}
                  </>
                ) : canPay ? (
                  <>
                    <Lock className="w-4 h-4" />
                    Pay {amounts ? formatINRString(amounts.total) : ""} Securely
                  </>
                ) : (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Preparing…
                  </>
                )}
              </button>
            )}

            {retryable ? (
              <button
                onClick={() => {
                  settledRef.current = false;
                  setNotice(null);
                  setError(null);
                  go("retry");
                }}
                className="mt-3 w-full bg-white hover:bg-[#f7f9fb] text-gray-700 border border-[#eceef0] py-3 rounded-xl text-xs font-bold transition-colors"
              >
                Try Payment Again
              </button>
            ) : error && !checkout ? (
              <button
                onClick={async () => {
                  try {
                    const next = await fetchCheckout();
                    if (!next) return;
                    setError(null);
                    go("create");
                    setCheckout(next);
                    go("checkout");
                  } catch {
                    setError("Could not start checkout. Please try again.");
                    go("error");
                  }
                }}
                className="mt-3 w-full bg-white hover:bg-[#f7f9fb] text-gray-700 border border-[#eceef0] py-3 rounded-xl text-xs font-bold transition-colors"
              >
                Load Checkout Again
              </button>
            ) : (
              !isFree && (
                <button
                  onClick={handleCancel}
                  disabled={phase === "opening" || phase === "verifying"}
                  className="mt-3 w-full bg-white hover:bg-[#f7f9fb] text-gray-700 border border-[#eceef0] py-3 rounded-xl text-xs font-bold transition-colors disabled:opacity-60"
                >
                  Cancel Payment
                </button>
              )
            )}

            <p className="mt-3 text-[11px] text-gray-400 text-center">
              Payment is processed via Razorpay; in Test Mode no real money is charged.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};