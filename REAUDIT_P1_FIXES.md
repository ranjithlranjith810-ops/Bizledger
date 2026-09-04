# BIZLEDGER — P1/P2 Frontend Fix Re-Audit Report

Date: 03 Sep 2026
Scope: P1 invoice-correctness fixes + P2 fixes. Field-validation phase NOT started (per ordering).

## Result

| Item | Status | Verification |
|------|--------|--------------|
| P1-1 POS not hardcoded | **PASS** | Conversion derives POS from customer state |
| P1-2 POS state/code synchronized | **PASS** | Modal init sync + customer auto-fill |
| P1-3 IGST vs CGST/SGST | **PASS** | `taxType` engine + render surfaces |
| P1-4 Download PDF | **PASS** | Renamed to "Print / Save as PDF" → `window.print()` |
| P2-1 Invoice empty state | **PASS** | Distinguishes zero invoices vs filter match |
| P2-2 Customer stateCode | **PASS** | `stateCode` stored on Customer create/edit |
| P2-3 Admin bridge | **DEFERRED** | Documented as backend-phase requirement |
| Build | **PASS** | `npm run build` |
| TypeScript | **PASS** | `npx tsc --noEmit` |
| Unit tests | **205/205** | 5 harnesses (37 new tax-specific) |
| Browser | **23/23** | same-state, interstate, conversion, historical |

## P1 Fixes

### P1-1 — Place of Supply not hardcoded
- **Before:** quotation→invoice (`AppContext.tsx`) and estimate→invoice conversion hard-coded `placeOfSupply: "Tamil Nadu (33)"`, `placeOfSupplyCode: "33"`.
- **After:** conversion derives POS via `placeOfSupplyFromState(customerState)` at `AppContext.tsx` — customer state → formatted "State (code)" pair. Never defaults to the seller state. If the customer state is unproven, POS is left empty and the GST engine conservatively resolves intrastate.

### P1-2 — POS state + code synchronized
- `AddInvoiceModal` now initializes `placeOfSupplyCode` from the POS string's embedded code on mount (was `""`), so the pair is always consistent even before user interaction. `handleCustomerSelect` continues to auto-fill both from the customer's state.

### P1-3 — IGST vs CGST/SGST (core engine + data flow)
- `src/lib/invoice.ts`: added `TaxType`, `resolveTaxType(sellerCode, posCode)`, `splitTaxType(totalTax, taxType)`, and a per-line `igst` field. `calculateLineTotals` / `calculateInvoiceTotals` take `taxType` (default `intrastate` for backward-compat with quotes/estimates/POs).
  - intrastate (same state code): CGST + SGST, IGST = 0.
  - interstate (different state code): IGST, CGST = SGST = 0.
  - Uses canonical numeric state codes only — never display names. No hard-coded `33`/`Tamil Nadu` in tax logic.
- `AddInvoiceModal` computes `taxType` live from the company state code vs `placeOfSupplyCode` and passes it into the shared engine for both the live totals and the stored invoice; the summary renders IGST for interstate.
- `InvoiceDetailsView` renders an IGST row for interstate invoices instead of CGST/SGST.
- Conversion paths reclassify the stored `cgst/sgst/igst` from `totalTax` under the correct `taxType` via `splitTaxType` — **drift-free** (subtotal/grandTotal preserved), historical-doc-safe.

### P1-4 — Download PDF
- No PDF library is bundled (`package.json` has none). Per scope, the action was renamed to **"Print / Save as PDF"** and wired to `window.print()` (browser dialog → Save as PDF) in `InvoiceDetailsView` and `InvoicesList` (list navigates to details where print works). The fake "PDF downloaded" toast was removed.

## P2 Fixes

### P2-1 — Empty-state copy
- `InvoicesList`, `QuotationsList`, `EstimatesList`, `PurchaseOrdersList`: when the account has **zero** documents of that type, show "No X yet — create your first."; only when records exist but none match filters show "No X match your filter criteria."

### P2-2 — Customer `stateCode`
- `Customer` type now has `stateCode?: string`. `AddCustomerModal` derives and stores it from `billingAddress.state` via `INDIAN_STATES`. (Invoice POS derivation already reads the state name, so this persists the code for backend/future use.)

### P2-3 — Admin bridge (backend-phase)
- Recognized but **deferred to backend** phase: the customer app (port 3000) and admin app (port 3001) have separate localStorage; cross-origin data sync is a real isolation limitation that a frontend-only change cannot fix. Documented; no frontend code change.

## Search Requirement
All occurrences of `Tamil Nadu`, `33`, `placeOfSupply(Code)`, `igst/cgst/sgst`, `Download PDF`, `window.print` were classified across the customer frontend:
- `src/lib/india.ts` — legitimate state-master data (kept).
- `src/data/mockData.ts` — legitimate seed/historical invoice & company data incl. an intentional Haryana interstate example (kept).
- `src/lib/documentConfig.ts`, `CompanyProfileView.tsx` T&C placeholder — legitimate legal/terms text (kept).
- `OnboardingWizard`, `AddCustomerModal` default state, `validation.ts` messages — pre-existing defaults / P3 scope (field-validation / free-text), **left untouched in this phase**.
- `PurchaseOrderDetailsView`, `SalesDocumentDetailsView`, `ReportsView` "Download PDF" — non-invoice document types, out of the P1-4 scope (noted).
- No accidental hard-coded defaults remain in the invoice/conversion/tax path.

## Verification Summary

### Unit harnesses (Temp, `Module._load`/compiled-lib pattern)
- P1-TAX: 37/37 (resolveTaxType, splitTaxType, line + invoice totals intrastate/interstate, inclusive/exclusive)
- DIR: 41/41 · SIG: 17/17 · ENT+documentConfig: 40/40 · step3-unit: 70/70
- **Total 205/205**

### Browser probes (puppeteer, real UI on :3000)
- P1-TAX-BROWSER 11/11: same-state TN → CGST=SGST=90/IGST=0; interstate Karnataka → IGST=180/CGST=SGST=0; POS codes synced; grandTotal preserved.
- P1-CONVERT-BROWSER 6/6: quotation→invoice derives Karnataka POS, reclassifies to IGST=180, grandTotal 1180 drift-free.
- P1-HISTORICAL-BROWSER 6/6: existing interstate invoice renders IGST and is **not mutated**.
- **Total 23/23**

### Notes / caveats
- Some legacy temp probes had invalid seed GSTINs (e.g. `33AABC`) that `validateContact` correctly rejects; they were corrected to valid 15-char GSTINs. This is probe data, not a product defect. `enforce-probe`'s "create at 4/5" is flaky under its crude DOM automation; an instrumented re-run confirmed creation at 4/5 succeeds (count 4 → 5).
- No production/GA claim: simulated payments are not real; frontend admin auth is not production security; the customer/admin cross-origin gap (3000 vs 3001) is real and backend-phase.
