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
        { label: "localStorage", value: "Your account, ledger, preferences, and business data. This is how the demo persists your work between sessions, entirely on your own device." },
        { label: "sessionStorage", value: "Not used for tracking. Nothing stored here is shared." },
        { label: "Cookies", value: "We do not set cookies for tracking, advertising, or analytics." },
      ],
    },
  },
  {
    heading: "3. Why we use localStorage",
    items: [
      "To let the demo build work fully offline in one browser.",
      "So your data stays on your device instead of being transmitted to a server in this phase.",
    ],
  },
  {
    heading: "4. How to clear your data",
    items: [
      "In the demo app: use the in-app \"Reset\" options in Settings to wipe your local data.",
      "Manually: clear site data for BizLedger from your browser settings. This removes all BizLedger localStorage.",
      "Clearing site data logs you out and erases all demo ledger data locally.",
    ],
  },
  {
    heading: "5. Contact",
    body: `If you have questions about how we store data in your browser, contact ${LEGAL.contactEmail}.`,
  },
];

export default function CookiesPage() {
  return <LegalLayout slug="cookies" sections={SECTIONS} />;
}