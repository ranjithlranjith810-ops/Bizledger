import { PaymentSuccessView } from "@/components/pricing/PaymentSuccessView";

interface SuccessSearchParams {
  planId?: string;
  period?: string;
  orderId?: string;
  paymentId?: string;
  total?: string;
}

export default async function PaymentSuccessPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const str = (v: string | string[] | undefined) =>
    typeof v === "string" ? v : undefined;

  const props: SuccessSearchParams = {
    planId: str(sp.planId),
    period: str(sp.period),
    orderId: str(sp.orderId),
    paymentId: str(sp.paymentId),
    total: str(sp.total),
  };
  return <PaymentSuccessView {...props} />;
}