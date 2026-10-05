import { LegalLayout } from "@/components/legal/LegalLayout";
import { LEGAL } from "@/config/legal";

const SECTIONS = [
  {
    heading: "1. Do we use cookies?",
    body: "No. BizLedger does not deploy tracking, advertising, or analytics cookies, and does not run a third-party cookie or consent banner. For clarity, operator-owned functional localStorage does not fall within the statutory web-cookie definition we address here. This page is published for transparency and to distinguish browser storage from cookies.",
  },
  {
    heading: "2. What we store in your browser",
    table: {
      rows: [
        { label: "localStorage", value: "Lightweight app preferences and cached data used to improve your experience between sessions. Your account and ledger data are stored securely by BizLedger, not in your browser." },
        { label: "sessionStorage", value: "Not used for tracking. Nothing stored here is shared." },
        { label: "Cookies", value: "We do not set cookies for tracking, advertising, or analytics." },
      ],
    },
  },
  {
    heading: "3. Why we use localStorage",
    items: [
      "To keep lightweight app preferences and cached data available between sessions.",
      "localStorage is a standard browser facility; we do not use it for tracking, advertising, or analytics.",
    ],
  },
  {
    heading: "4. How to clear your data",
    items: [
      "In the app: use the in-app \"Reset\" options in Settings to clear locally stored preferences and cached data.",
      "Manually: clear site data for BizLedger from your browser settings. This removes all BizLedger localStorage.",
      "Clearing site data may log you out and removes the locally stored BizLedger preferences and cached data.",
    ],
  },
  {
    heading: "5. Contact",
    body: `If you have questions about how BizLedger stores your data, contact ${LEGAL.contactEmail}.`,
  },
];

export default function CookiesPage() {
  return <LegalLayout slug="cookies" sections={SECTIONS} />;
}