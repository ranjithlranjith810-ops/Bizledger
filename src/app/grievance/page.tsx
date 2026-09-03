import { LegalLayout } from "@/components/legal/LegalLayout";
import { LEGAL } from "@/config/legal";

const SECTIONS = [
  {
    heading: "1. How to raise a grievance",
    body: "We are committed to addressing your concerns fairly and promptly. You can contact us directly or, for data-privacy concerns, raise a complaint to our grievance officer as described below. This process is intended to satisfy the DPDP Rules 2025 consumer-complaint mechanism and consumer-protection e-commerce expectations.",
    items: [
      `General support & questions: ${LEGAL.contactEmail}`,
      `Data-privacy complaints: ${LEGAL.grievanceEmail}`,
    ],
  },
  {
    heading: "2. Grievance officer",
    table: {
      rows: [
        { label: "Name", value: LEGAL.grievanceOfficerName },
        { label: "Designation", value: LEGAL.grievanceOfficerDesignation },
        { label: "Email", value: LEGAL.grievanceEmail },
      ],
    },
    body: "The grievance officer's details become effective when we operate on a production backend. Until then, please use the support email for all concerns.",
  },
  {
    heading: "3. What to include",
    items: [
      "Your name and a way to reach you.",
      "A clear description of the concern, including any relevant invoice or reference number.",
      "Timeline of the issue and steps you already took.",
      "The relief you are seeking (e.g., correction, deletion, refund review).",
    ],
  },
  {
    heading: "4. Resolution timeline",
    items: [
      "We will acknowledge your complaint on receipt.",
      "We will aim to respond within a reasonable time (target: within 15 days) once the backend is operational.",
      "If we cannot resolve your concern to your satisfaction, we will point you to the appropriate adjudicating authority under applicable law.",
    ],
  },
  {
    heading: "5. Escalation",
    body: "If your grievance is not resolved, you may escalate to the relevant government authority in India (for data protection, the Data Protection Board of India established under the DPDP Act 2023, once fully commenced; for consumer issues, the appropriate consumer commission under applicable law). This page does not limit your rights under any statute.",
  },
];

export default function GrievancePage() {
  return <LegalLayout slug="grievance" sections={SECTIONS} />;
}