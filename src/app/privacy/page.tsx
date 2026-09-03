import { LegalLayout } from "@/components/legal/LegalLayout";
import { LEGAL } from "@/config/legal";

const SECTIONS = [
  {
    heading: "1. Scope & legal basis",
    body: `This Privacy Policy explains how BizLedger (${LEGAL.entityName}) collects, uses, stores, and protects personal and business information you enter. It aligns with the Digital Personal Data Protection (DPDP) Act 2023 and the DPDP Rules 2025 (notified 13 November 2025), as applicable. Because BizLedger is a frontend demo build, no personal data is transmitted to us at this time.`,
    items: [
      "Data is stored locally in your browser via localStorage.",
      "Nothing is uploaded to a server, cloud, or third-party processor today.",
      "Section 4 explains the intended (future) data-processing model.",
    ],
  },
  {
    heading: "2. Information you provide",
    table: {
      rows: [
        { label: "Account", value: "Name and email address you enter when creating your account locally." },
        { label: "Business data", value: "Company profile, customers, products, invoices, expenses, fleet, team, and directory details you enter." },
        { label: "Payment info", value: "We record payment records locally. No real card or UPI data is collected or processed in this demo." },
      ],
    },
  },
  {
    heading: "3. How we use information",
    items: [
      "To power the ledger, invoicing, and directory features you explicitly use.",
      "To display your business network listing to other users (only the fields you explicitly publish).",
      "To show you your own subscription and billing history.",
    ],
  },
  {
    heading: "4. Intended (future) processing model",
    body: "After launch on a production backend, this section will describe: data minimization and purpose limitation, lawful bases under the DPDP Act, consent collection, data retention periods, rights (access, correction, erasure, grievance), data-principal complaint mechanisms, cross-border transfer safeguards, and breach-notification timelines. None of these are active during the demo build.",
  },
  {
    heading: "5. Sharing & disclosure",
    items: [
      "We do not share your data with third parties in this demo build.",
      "We will not sell your personal data.",
      "On a production backend, disclosure would occur only as required by law or as described in an updated Privacy Policy.",
    ],
  },
  {
    heading: "6. Data retention & deletion",
    body: "Your data persists only as long as it remains in your browser localStorage. You can erase it entirely by (a) clearing site data for BizLedger in your browser, or (b) using the in-app reset options during the demo. A server-side account-deletion and data-export feature is planned for the backend phase.",
  },
  {
    heading: "7. Data-principal rights",
    items: [
      "Access, correct, and delete information via the app (frontend) and, in future, via the backend.",
      "Withdraw consent by removing your data and stopping use.",
      "Exercising these rights is free of charge and should be straightforward in the demo.",
    ],
  },
  {
    heading: "8. Contact & grievance",
    items: [
      `Questions: ${LEGAL.contactEmail}.`,
      "If you believe your data-related concern has not been addressed, you may raise it through our Grievance Redressal page.",
    ],
  },
];

export default function PrivacyPage() {
  return <LegalLayout slug="privacy" sections={SECTIONS} />;
}