import { LegalLayout } from "@/components/legal/LegalLayout";
import { LEGAL } from "@/config/legal";

const SECTIONS = [
  {
    heading: "1. Scope & legal basis",
    body: `This Privacy Policy explains how BizLedger (${LEGAL.entityName}) collects, uses, stores, and protects personal and business information you enter. It aligns with the Digital Personal Data Protection (DPDP) Act 2023 and the DPDP Rules 2025 (notified 13 November 2025), as applicable.`,
    items: [
      "Account data (name and email) is stored securely by BizLedger and used to manage your account.",
      "Business data you create is used to power the features you use and is not sold or shared with advertisers.",
      "You can request deletion of your data at any time as described below.",
    ],
  },
  {
    heading: "2. Information you provide",
    table: {
      rows: [
        { label: "Account", value: "Name and email address you enter when creating your account." },
        { label: "Business data", value: "Company profile, customers, products, invoices, expenses, fleet, team, and directory details you enter." },
        { label: "Payment info", value: "Payment records and billing history associated with your account. Card or UPI credentials are handled by our payment partner and are never stored by BizLedger." },
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
    heading: "4. How we protect information",
    body: "We apply reasonable technical and organizational security measures, including encrypted transmission, authenticated access, and restricted administrative access, as described in our Security page. Access to your data is limited to what is necessary to operate the service.",
  },
  {
    heading: "5. Sharing & disclosure",
    items: [
      "We do not sell your personal data.",
      "We share data only with service providers that help us operate the service (such as our payment partner) or where disclosure is required by law.",
      "On a production backend, disclosure would occur only as required by law or as described in an updated Privacy Policy.",
    ],
  },
  {
    heading: "6. Data retention & deletion",
    body: "Account and ledger data is retained for as long as your account is active and as needed to provide the service. You can erase locally stored preferences and cached data at any time by clearing site data for BizLedger in your browser or using the in-app reset options. To delete your account data, contact us at the address below and we will respond promptly.",
  },
  {
    heading: "7. Data-principal rights",
    items: [
      "Access, correct, and delete information via the app.",
      "Withdraw consent by removing your data and stopping use of the service.",
      "Exercising these rights is free of charge.",
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