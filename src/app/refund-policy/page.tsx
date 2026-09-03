import { LegalLayout } from "@/components/legal/LegalLayout";
import { REFUND_WINDOW_DAYS, LEGAL } from "@/config/legal";

const SECTIONS = [
  {
    heading: "1. Overview",
    body: `This policy describes refunds and cancellations for paid BizLedger subscription plans operated by ${LEGAL.entityName}. It is guided by Indian consumer-protection norms and, where applicable, RBI guidance on payments. IMPORTANT: BizLedger is currently a frontend demo build. Payments are SIMULATED and do not charge your bank account or wallet. There is therefore no real money to refund until a production payment processor is integrated.`,
    items: [
      "The refund mechanisms below describe intended policy for the production service.",
      "In the demo, the in-app \"Request Refund\" flow records your request locally for demonstration only; it does not move money.",
    ],
  },
  {
    heading: "2. 7-day money-back window",
    body: `For paid plans, you may request a full refund within ${REFUND_WINDOW_DAYS} calendar days of the purchase date if you are unsatisfied with the service. After this window, subscriptions are non-refundable except where required by applicable law.`,
  },
  {
    heading: "3. How to request a refund",
    items: [
      "Open Subscription & Billing, choose the relevant paid invoice, and tap Request Refund.",
      "Provide a short reason. Your request is recorded immediately.",
      "Refund processing and grant/denial decisions require a production backend and will be communicated to you as described below.",
    ],
  },
  {
    heading: "4. Processing timeline",
    table: {
      rows: [
        { label: "Eligible requests", value: `Within ${REFUND_WINDOW_DAYS} days of purchase, or as required by applicable law.` },
        { label: "Refund method", value: "Credit back to the original payment method (needs a production payment processor)." },
        { label: "Processing time", value: "Typically within a reasonable time after approval; exact timelines will be published before launch." },
        { label: "Other subscriptions", value: "Downgrades take effect at the next billing cycle; the unused remaining period may be refunded pro-rata at our discretion." },
      ],
    },
  },
  {
    heading: "5. Non-refundable items & exclusions",
    items: [
      "Base (free) plan incidents do not involve payment and are not eligible for refunds.",
      "Abuse or misuse of the service may void a refund request.",
      "This policy is a fair and transparent statement of intent and does not override mandatory consumer-protection rights.",
    ],
  },
  {
    heading: "6. Disputes & grievance",
    body: `If you believe a refund was wrongly denied or a payment issue arises, contact ${LEGAL.contactEmail} or raise a concern through the Grievance Redressal page. We commit to handling disputes fairly and promptly.`,
  },
];

export default function RefundPolicyPage() {
  return <LegalLayout slug="refund-policy" sections={SECTIONS} />;
}