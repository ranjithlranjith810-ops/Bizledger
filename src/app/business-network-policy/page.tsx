import { LegalLayout } from "@/components/legal/LegalLayout";
import { LEGAL } from "@/config/legal";

const SECTIONS = [
  {
    heading: "1. What the Business Network is",
    body: "The Business Network is a public, opt-in directory where you can publish your business so prospective customers and vendors can find you. It is operated by BizLedger and governed by this policy.",
  },
  {
    heading: "2. Eligibility & access",
    items: [
      "The Business Network is a PAID feature included with the Business and Enterprise plans.",
      "The Base (free) plan does not include directory access.",
      "You must have an active paid subscription to create, edit, or publish a listing.",
      "One directory listing is available per account.",
    ],
  },
  {
    heading: "3. What you publish",
    body: "You choose which business details to publish. Only the fields you explicitly submit are shown publicly. Private company details that you do not publish remain private.",
    table: {
      rows: [
        { label: "Public", value: "Business name, category, description, address, contact person, phone(s), email, and website you choose to include." },
        { label: "Private", value: "Anything you do not add to your listing remains inside your own ledger and is not published." },
        { label: "Verification", value: "GST verification is a backend feature planned later; during the demo, a provided GSTIN is labelled \"GSTIN Provided\" only." },
      ],
    },
  },
  {
    heading: "4. Acceptable content & conduct",
    items: [
      "Provide accurate, lawful information about your own business only.",
      "Do not impersonate others or use the directory for misleading or prohibited activity.",
      "Follow all applicable laws, including GST registration requirements where applicable.",
      "We may reject, suspend, or remove listings that violate this policy or applicable law.",
    ],
  },
  {
    heading: "5. Moderation & removal",
    items: [
      "Listings may be reviewed for compliance before or after publication.",
      "If a listing is rejected or suspended, we show you the reason in the app and let you fix and resubmit.",
      "You can unlist your business at any time from the app; unlisting hides it from the directory.",
    ],
  },
  {
    heading: "6. Third-party reliance",
    body: "A directory listing does not guarantee verification, certification, creditworthiness, or the quality of any business. We are not a party to transactions you arrange through the directory and are not responsible for disputes between businesses.",
  },
  {
    heading: "7. Contact",
    body: `For questions or to report a listing, contact ${LEGAL.contactEmail}.`,
  },
];

export default function BusinessNetworkPolicyPage() {
  return <LegalLayout slug="business-network-policy" sections={SECTIONS} />;
}