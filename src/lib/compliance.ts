// Centralized GST / E-Way Bill compliance guidance.
//
// IMPORTANT LEGAL NOTE: This module produces non-blocking, informational
// compliance warnings for the user's own awareness. It does NOT generate e-way
// bills and it does NOT change any invoice figures. Generating an invoice is a
// SEPARATE act from generating an e-way bill, so the invoice may still be
// created while this warning is displayed.
//
// Source / basis for the statutory threshold: under Central GST (CGST) Rules,
// Rule 138 (E-way bills), a general e-way bill is required for the transport of
// consignment value exceeding ₹50,000 (subject to the exemptions and category
// conditions prescribed). This should be VERIFIED against the current official
// CBIC guidance (GSTN / CBIC) before relying on it in a live deployment.
//
// This module deliberately REFUSES to present ₹96,000 / ₹1,00,000 as the
// "legal e-way bill threshold". Those values, when provided, are only optional
// INTERNAL safety-warning levels (e.g. a business policy to review high-value
// consignments) and are never labeled as statutory.

export type EWayBillComplianceState = "SAFE" | "WARNING" | "REQUIRED_REVIEW";

export interface EWayBillConfig {
  // Statutory e-way bill threshold (Rule 138 guidance): general lower bound.
  statutoryThreshold: number;
  // General warning threshold. Treated as === statutoryThreshold by default;
  // may be configured LOWER than statutory to surface advisory warnings sooner.
  warningThreshold: number;
  // Optional internal safety-warning levels (NEVER labeled "legal threshold").
  // Enabled when > 0.
  businessSafetyWarning96000: number;
  businessSafetyWarning100000: number;
  // Deterministic metadata surfaced for transparency.
  source: string;
  effectiveDate: string;
  applicableScope: string;
  lastVerifiedDate: string;
}

export const DEFAULT_EWAY_BILL_CONFIG: EWayBillConfig = {
  // Rule 138 general guidance: consignment value exceeding ₹50,000.
  statutoryThreshold: 50000,
  warningThreshold: 50000,
  businessSafetyWarning96000: 96000,
  businessSafetyWarning100000: 100000,
  source: "CBIC GST — Central Goods and Services Tax Rules, Rule 138 (E-way bills)",
  effectiveDate: "Current guidance (verify against CBIC/GSTN before live use)",
  applicableScope: "Self-declared supplies/transport eligible for e-way bill generation",
  lastVerifiedDate: "2026-09-02",
};

export const EWAY_BILL_STATUTORY_THRESHOLD = DEFAULT_EWAY_BILL_CONFIG.statutoryThreshold;
export const EWAY_BILL_WARNING_THRESHOLD = DEFAULT_EWAY_BILL_CONFIG.warningThreshold;
export const BUSINESS_SAFETY_WARNING_96000 = DEFAULT_EWAY_BILL_CONFIG.businessSafetyWarning96000;
export const BUSINESS_SAFETY_WARNING_100000 = DEFAULT_EWAY_BILL_CONFIG.businessSafetyWarning100000;

export interface EWayBillComplianceResult {
  state: EWayBillComplianceState;
  consignmentValue: number;
  statutoryThreshold: number;
  warningThreshold: number;
  // Which (if any) optional internal safety-warning levels are exceeded.
  exceededSafetyWarnings: number[];
  // Human guidance for the UI. Deliberately avoids claiming the invoice is
  // "legally invalid" or quoting statutory fine amounts.
  message: string;
}

// Classify a consignment/invoice value into a compliance state. Pure and
// dependency-free so it is unit-testable and independently reusable by a future
// backend.
export function getEWayBillComplianceStatus(
  consignmentValue: number,
  config: Partial<EWayBillConfig> = {}
): EWayBillComplianceResult {
  const cfg: EWayBillConfig = { ...DEFAULT_EWAY_BILL_CONFIG, ...config };
  const value = Number(consignmentValue) || 0;

  const exceededSafetyWarnings: number[] = [];
  if (cfg.businessSafetyWarning96000 > 0 && value > cfg.businessSafetyWarning96000) {
    exceededSafetyWarnings.push(cfg.businessSafetyWarning96000);
  }
  if (cfg.businessSafetyWarning100000 > 0 && value > cfg.businessSafetyWarning100000) {
    exceededSafetyWarnings.push(cfg.businessSafetyWarning100000);
  }

  let state: EWayBillComplianceState;
  let message: string;
  if (value > cfg.statutoryThreshold) {
    state = "REQUIRED_REVIEW";
    message = `The consignment value exceeds the statutory e-way bill threshold (₹${cfg.statutoryThreshold.toLocaleString(
      "en-IN"
    )}). Please verify whether an e-way bill is required for this supply. Non-compliance may result in consequences under applicable GST law.`;
  } else if (value > cfg.warningThreshold) {
    state = "WARNING";
    message = `The consignment value is above the configured e-way bill warning threshold (₹${cfg.warningThreshold.toLocaleString(
      "en-IN"
    )}). Review whether an e-way bill is required before dispatch.`;
  } else {
    state = "SAFE";
    message = `Consignment value is below the statutory e-way bill threshold (₹${cfg.statutoryThreshold.toLocaleString(
      "en-IN"
    )}).`;
  }

  if (exceededSafetyWarnings.length > 0) {
    message += ` Internal high-value safety marker triggered (${exceededSafetyWarnings
      .map((n) => `₹${n.toLocaleString("en-IN")}`)
      .join(", ")}). These are internal advisory levels only — not statutory thresholds.`;
  }

  return {
    state,
    consignmentValue: value,
    statutoryThreshold: cfg.statutoryThreshold,
    warningThreshold: cfg.warningThreshold,
    exceededSafetyWarnings,
    message,
  };
}

// Configuration metadata surfaced in a dedicated compliance panel.
export function getEWayBillComplianceConfig(): EWayBillConfig {
  return { ...DEFAULT_EWAY_BILL_CONFIG };
}