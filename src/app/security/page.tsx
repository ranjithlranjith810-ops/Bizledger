import { LegalLayout } from "@/components/legal/LegalLayout";
import { LEGAL } from "@/config/legal";

const SECTIONS = [
  {
    heading: "1. Security posture",
    body: `We publish this page to be transparent about how we handle security. BizLedger protects your account with authenticated sessions and hashed credentials, encrypts traffic in transit, and restricts privileged operations to authorized administrators. We continuously review our controls and improve them as the service evolves.`,
    items: [
      "Account authentication is handled by our own authentication service; passwords are never stored in plain text.",
      "The admin console uses server-side role checks, so privileged actions cannot be triggered from the browser UI alone.",
      "We never log secrets and never ask for or store financial credentials.",
    ],
  },
  {
    heading: "2. What we do today",
    items: [
      "We guard against server-side logging of secrets and never ask for or store financial credentials.",
      "Plan entitlement and privileged features are enforced server-side.",
      "We avoid dark patterns and keep security messaging honest in the UI.",
    ],
  },
  {
    heading: "3. Reasonable security practices",
    body: "We implement reasonable security practices consistent with the Information Technology (Reasonable Security Practices and Procedures and Sensitive Personal Data or Information) Rules, 2011, including access control, data classification, vendor diligence, and breach handling.",
  },
  {
    heading: "4. Incident reporting",
    items: [
      `If you discover a security concern, notify us at ${LEGAL.contactEmail} before disclosing it publicly.`,
      "We will acknowledge, triage, and, where appropriate, publish responsible-disclosure guidance on this page.",
      "We will report notifiable data breaches as required by applicable law, including the DPDP Act 2023 and its rules.",
    ],
  },
  {
    heading: "5. Your responsibilities",
    items: [
      "Use a strong, unique password for your BizLedger account and keep it confidential.",
      "Log out on shared or public devices and report any suspicious account activity to us promptly.",
    ],
  },
];

export default function SecurityPage() {
  return <LegalLayout slug="security" sections={SECTIONS} />;
}