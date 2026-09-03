// Central legal / policy configuration (single source of truth).
//
// BizLedger is currently a frontend demo build: all data is stored locally in
// the user's browser (localStorage). No server, database, or on-file legal
// relationship exists yet. As a result every company identifier below is a
// PLACEHOLDER and must be replaced before launch. We deliberately do NOT
// invent a legal entity, registered address, trademarks, or statutory details.
//
// Legal basis referenced by the policy documents:
//   - DPDP Act 2023 & DPDP Rules 2025 (notified 13 Nov 2025; phased commencement)
//   - Consumer Protection / E-Commerce framework (incl. e-entities rules)
//   - Information Technology (Reasonable Security Practices) Rules, 2011
//   - CBIC GST invoicing & e-way bill rules (Rule 138: ₹50,000 threshold)
//   - RBI payment guidance
//
// NOTE: This is a policy DOCUMENTATION layer only. Browser localStorage is not
// "cookies" in the statutory web-cookie sense; we do not run a cookie consent
// banner and we never state that we issue or process cookies for tracking.

export const LEGAL_PLACEHOLDER = "[LEGAL ENTITY NAME]";

export const LEGAL = {
  // Legal entity (placeholder — never fabricate one).
  entityName: "[LEGAL ENTITY NAME]",
  registeredOffice: "[REGISTERED OFFICE ADDRESS]",
  cin: "[CIN/LLPIN]",
  gstin: "[GSTIN]",
  pan: "[PAN]",
  contactEmail: "support@bizledger.io",
  grievanceEmail: "[GRIEVANCE OFFICER EMAIL]",
  supportPhone: "[SUPPORT PHONE]",
  grievanceOfficerName: "[GRIEVANCE OFFICER NAME]",
  grievanceOfficerDesignation: "[GRIEVANCE OFFICER DESIGNATION]",
  website: "https://bizledger.io",
} as const;

export interface LegalDocMeta {
  slug: string;
  title: string;
  version: string;
  effectiveDate: string; // DD MMM YYYY
  summary: string;
}

// Effective from 01 Jan 2026 by default. Each document carries its own version
// and an explicit effective date so changes are auditable in future revisions.
export const LEGAL_DOCS: LegalDocMeta[] = [
  {
    slug: "terms",
    title: "Terms of Service",
    version: "1.0",
    effectiveDate: "01 Jan 2026",
    summary:
      "The rules governing your use of BizLedger, your account, paid plans, and acceptable use.",
  },
  {
    slug: "privacy",
    title: "Privacy Policy",
    version: "1.0",
    effectiveDate: "01 Jan 2026",
    summary:
      "How we handle the personal and business data you enter, aligned with the DPDP Act 2023 and DPDP Rules 2025.",
  },
  {
    slug: "cookies",
    title: "Cookie & Local-Storage Notice",
    version: "1.0",
    effectiveDate: "01 Jan 2026",
    summary:
      "What we store in your browser (localStorage, not tracking cookies) and how you can clear it.",
  },
  {
    slug: "refund-policy",
    title: "Refund & Cancellation Policy",
    version: "1.0",
    effectiveDate: "01 Jan 2026",
    summary:
      "Our payment, subscription, and refund terms, including the 7-day money-back window for paid plans.",
  },
  {
    slug: "business-network-policy",
    title: "Business Network Policy",
    version: "1.0",
    effectiveDate: "01 Jan 2026",
    summary:
      "Guidelines for the public business directory: eligibility, content standards, moderation, and removal.",
  },
  {
    slug: "security",
    title: "Security & Data Handling",
    version: "1.0",
    effectiveDate: "01 Jan 2026",
    summary:
      "How we protect your information, what security is not yet implemented, and incident-reporting steps.",
  },
  {
    slug: "grievance",
    title: "Grievance Redressal",
    version: "1.0",
    effectiveDate: "01 Jan 2026",
    summary:
      "How to raise concerns, escalating to our grievance officer and, where applicable, adjudicating authorities.",
  },
];

export const LEGAL_LINKS = LEGAL_DOCS.map((d) => ({
  href: `/${d.slug}`,
  label: d.title,
  slug: d.slug,
}));

export function legalDoc(slug: string): LegalDocMeta | undefined {
  return LEGAL_DOCS.find((d) => d.slug === slug);
}

// Refund window for paid subscriptions (calendar days from purchase).
export const REFUND_WINDOW_DAYS = 7;