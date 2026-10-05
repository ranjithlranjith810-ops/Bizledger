import { LegalLayout } from "@/components/legal/LegalLayout";
import { LEGAL, LEGAL_PLACEHOLDER } from "@/config/legal";

const SECTIONS = [
  {
    heading: "1. About this service",
    body: `BizLedger is operated by ${LEGAL.entityName}. These Terms of Service govern your access to and use of the BizLedger web application.`,
    items: [
      "Your account, ledger, and business data are stored securely by BizLedger and its service providers.",
      "Clearing your browser storage does not erase your BizLedger account data.",
      "Your data is processed only as described in the Privacy Policy.",
    ],
  },
  {
    heading: "2. Your account",
    body: "You are responsible for the accuracy of the account details you provide and for any activity that happens under your account within a single browser profile.",
  },
  {
    heading: "3. Paid plans & billing",
    items: [
      "Plan prices, GST, and billing-cycle terms are displayed on the Pricing page before you pay.",
      "A plan is only activated after a successful payment. Declined payments leave your current plan unchanged.",
      "Payments are processed by our payment partner through the app's checkout flow.",
      "If a real paid subscription is offered later, refunds will be governed by our Refund & Cancellation Policy.",
    ],
  },
  {
    heading: "4. Acceptable use",
    items: [
      "You must comply with applicable Indian laws, including GST, DPDP Act 2023 and its rules.",
      "You must not misuse the service, attempt to harm its availability, or misrepresent identity.",
      "Directory listings must follow the Business Network Policy.",
    ],
  },
  {
    heading: "5. Intellectual property",
    items: [
      `${LEGAL_PLACEHOLDER} (the operator) and its licensors own the BizLedger software, design, and brand. You get no rights beyond using the application for your own internal business record-keeping.`,
    ],
  },
  {
    heading: "6. Disclaimers & limitation of liability",
    items: [
      "The service is provided \"as is\" and \"as available\".",
      "BizLedger is a bookkeeping tool and is not accounting, tax, or legal advice.",
      "To the maximum extent permitted by applicable law, we are not liable to you for indirect, incidental, or consequential damages arising from use of the service.",
    ],
  },
  {
    heading: "7. Changes to these terms",
    body: "We may revise these Terms. The latest version, with its effective date, is always published on this page. Continued use after a revision means you accept the updated Terms.",
  },
  {
    heading: "8. Contact",
    items: [
      `For questions about these Terms, contact ${LEGAL.contactEmail}.`,
      "To raise a concern under applicable law, use our Grievance Redressal process.",
    ],
  },
];

export default function TermsPage() {
  return <LegalLayout slug="terms" sections={SECTIONS} />;
}