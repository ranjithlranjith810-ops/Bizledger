import { SubscriptionPlan, PaymentMethod } from "@/types";

export const GST_RATE = 18;

// Yearly billing billed as 10 monthly installments (2 months free promo).
export const computePlanAmount = (
  plan: SubscriptionPlan,
  period: "month" | "year"
): number => (period === "month" ? plan.price : plan.price * 10);

export const computeTotals = (
  plan: SubscriptionPlan,
  period: "month" | "year"
) => {
  const base = computePlanAmount(plan, period);
  const gstAmount = Math.round(base * (GST_RATE / 100) * 100) / 100;
  const total = Math.round((base + gstAmount) * 100) / 100;
  return { base, gstRate: GST_RATE, gstAmount, total };
};

export const formatINR = (n: number) =>
  `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export const PAYMENT_METHODS: {
  id: PaymentMethod;
  label: string;
  hint: string;
}[] = [
  { id: "upi", label: "UPI", hint: "GPay, PhonePe, Paytm" },
  { id: "card", label: "Credit / Debit Card", hint: "Visa, Mastercard, RuPay" },
  { id: "netbanking", label: "Net Banking", hint: "All major Indian banks" },
  { id: "wallet", label: "Wallet", hint: "Paytm, Mobikwik, Amazon Pay" },
];

export const methodLabel = (m: PaymentMethod) =>
  PAYMENT_METHODS.find((x) => x.id === m)?.label ?? m;

export const planLabel = (name: string) => name.replace(/ Plan$/, "");
