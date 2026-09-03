import { LegalLayout } from "@/components/legal/LegalLayout";
import { LEGAL } from "@/config/legal";

const SECTIONS = [
  {
    heading: "1. Security posture & honest disclosure",
    body: `We publish this page to be transparent about how we handle security. In the current frontend demo build, security controls are limited because all data lives in your own browser. Nothing in this page should be read as a claim that a production-grade security infrastructure already exists.`,
    items: [
      "The demo stores data in localStorage on your device — security depends significantly on the browser and device you use.",
      "We do not yet operate: server-side authentication, role-based access control, database encryption at rest, a production audit log, or managed backups. These are planned for the backend phase.",
    ],
  },
  {
    heading: "2. What we do today",
    items: [
      "We guard against server-side logging of secrets and never ask for or store financial credentials in the demo.",
      "Plan entitlement and feature limits are enforced in the frontend for the demo.",
      "We avoid dark patterns and flag demo-only behavior clearly in the UI.",
    ],
  },
  {
    heading: "3. Reasonable security practices",
    body: "When the production backend is launched, we intend to implement reasonable security practices consistent with the Information Technology (Reasonable Security Practices and Procedures and Sensitive Personal Data or Information) Rules, 2011, including access control, data classification, vendor diligence, and breach handling.",
  },
  {
    heading: "4. Incident reporting",
    items: [
      `If you discover a security concern in the demo, notify us at ${LEGAL.contactEmail} before disclosing it publicly.`,
      "We will acknowledge, triage, and, where appropriate, publish responsible-disclosure guidance on this page.",
      "On a production backend, we will additionally report notifiable data breaches as required by applicable law, including the DPDP Act 2023 and its rules.",
    ],
  },
  {
    heading: "5. Your responsibilities",
    items: [
      "Keep your device and browser secure and avoid entering sensitive data into the demo build you would not want stored on that device.",
      "Use strong device-level protections given that data is stored locally.",
    ],
  },
];

export default function SecurityPage() {
  return <LegalLayout slug="security" sections={SECTIONS} />;
}