# BizLedger — Frontend Complete Audit Report

**Date:** 03 Sep 2026
**Scope:** Frontend audit of the customer app (`:3000`, `bizledger-master`) and admin app (`:3001`, `bizledger-admin`), performed via puppeteer browser probes + component source review. **Audit / record / classify only. No fixes applied in this phase.**

**Method:** Fresh isolated accounts seeded through the real signup+onboarding path and into a completed, active `business`-plan state. Each module probed in-browser; tax/layout logic verified by source review. Severity `P0=critical`, `P1=high`, `P2=medium`, `P3=low/informational`.

---

## 1. Verification baseline

- Push of legal checkpoint: remote `refs/heads/master` = `7f1e4e1` (`chore: checkpoint legal policy layer`), tree clean, no force. ✅
- Dev servers: customer `:3000` and admin `:3001` both running.
- Baseline regression floor (from prior phases): dir `41/41`, ent `40/40`, sig `17/17`, fy `18/18`, inv E2E `26/26`, plan-probe `7/7`, customer dir browser `13/13`, admin dir browser `8/8`, sig browser `17/17`, step3 unit `70/70`, step3 E2E `9/9`, step3 admin `3/3`.

---

## 2. Audit results by part

### PART A — Public Website ✅ (mostly pass)
- Landing loads; Get Started + Log in CTAs present; no horizontal overflow at 390px.
- All 7 legal pages (`/terms`, `/privacy`, `/cookies`, `/refund-policy`, `/business-network-policy`, `/security`, `/grievance`) render correct `h1`, version banner (`Version 1.0 · Effective …`), and cross-linked footer.
- Landing footer links to all 7 legal docs + `/pricing`.
- **P3:** `/pricing` is not publicly reachable — unauthenticated users are redirected to `/` (pricing lives behind the app shell). Pre-signup prospects cannot view plans.

### PART B — Authentication ✅
- Login empty → "Please enter the email you signed up with."
- Login unknown email → "No account found with this email."
- Signup empty → "Please enter your name and email address."
- **P3:** Invalid-email rejection at signup is handled by the browser's native `type="email"` constraint (submit is silently blocked, no app-level inline message). Behavior is acceptable (invalid email is rejected) but inconsistent with the app's other inline error styling.

### PART C — Onboarding observations
- 6-step wizard (`business → tax → address → invoice → FY → review`). Progress bar, stepper, back/continue/finish all function.
- **P3:** State on step 3 is a **free-text input** (placeholder "e.g. Tamil Nadu"), no structured list and no state code captured here.
- **P3:** Only step 1 (business name) and step 4 (starting number > 0) gate progression; business type, mobile, email, GSTIN, PAN, city, pincode are unvalidated at wizard level.
- **P3:** On step 1 the bottom-left button is labeled "Dashboard" (routes to `/dashboard`) though onboarding isn't complete — the dashboard redirects back to the pending onboarding step, so this is a dead/looping affordance for a user who isn't finished.
- GSTIN/PAN free-text with no format check in the wizard (validation deferred to invoice/company settings).

### PART D — Customers ✅ (functional)
- Empty-state renders; `Add Customer` modal opens; search + status filter present; adding a customer persists into the list.
- Form fields: Customer/Company Name* (required), GST Status (select), Payment Terms (select), GSTIN* (required when registered), Primary Contact, Mobile*, Email, Billing Address (Street, City*, Pincode, State* select from `INDIAN_STATES`), Credit Limit.
- **P2 — State code not stored on the Customer record.** State is a correct `<select>` of `INDIAN_STATES`, but the Customer type has **no `stateCode` field**; only the display name is saved. Invoices derive the code separately via `stateWithCode()`/place-of-supply.
- **P3 — Free-text fields lack format validation:** GSTIN accepts any text; Mobile is `type="text"` (no tel mask), pincode/email unvalidated at customer-save time.

### PART E / 21–22 — Products + HSN/SAC observation ✅ (rule upheld)
- **HSN/SAC is user-provided, never auto-generated.** The product form has an explicit `<input placeholder="Enter HSN code">` with helper "Please check your HSN code properly before saving." No lookup, no inference, no silent replace anywhere.
- Products list search covers name / SKU / HSN; HSN shown in the table.
- **P3:** Product HSN is not `required` and not format-gated on save (only gated when a line is used on an invoice, via `validateHsnSAC`).
- **P3:** Product GST-rate dropdown offers only 0/5/12/18/28 (12% default) — omits the 0.25% / 3% rates that `validateGstRate()` otherwise accepts.

### PART 5 — Invoices — **Primary issue cluster**
1. **P1 — Place of Supply is hard-coded to Tamil Nadu on conversion.** Both the quotation→invoice (`AppContext.tsx:983-984`) and estimate→invoice (`:1156-1157`) paths set `placeOfSupply: "Tamil Nadu (33)"`, `placeOfSupplyCode: "33"` regardless of the customer's actual state. An out-of-state customer's converted invoice shows the wrong place of supply.
2. **P1 — Invoice place-of-supply label/code can desync in the create modal.** The select defaults to "Tamil Nadu (33)" (no empty option), but `placeOfSupplyCode` initializes to `""` and only updates on user interaction of the `<select>`. Saving a new invoice without touching the field yields label "Tamil Nadu (33)" with an empty stored code.
3. **P1 — No IGST path; all invoices are intra-state CGST+SGST.** `calculateInvoiceTotals` (lib/invoice.ts:80-93) always sets `igst = 0` and splits tax into CGST+SGST regardless of the state relationship between company and customer. There is no inter-state/place-of-supply-driven tax classification anywhere in the code.
4. **P1 — "Download PDF" does not generate a PDF.** In both `InvoicesList` and `InvoiceDetailsView`, the Download button only fires a success toast ("PDF Downloaded / Tax Invoice PDF Ready"). Only `Print` (`window.print()`) produces output. No PDF library or real file generation exists.
5. **P2 — Empty-state copy is misleading.** On a brand-new account the invoices table shows "No invoices match your filter criteria." even though nothing exists yet (should invite creation).
- Invoice numbering, GST-inclusive/exclusive pricing modes, line validators (`validateHsnSAC`, quantity, price, GST rate, vehicle number), and `validateContact` all work.

### PART 6–8 — Quotations / Estimates / Purchase Orders
- Use the shared `SalesDocumentModal`/`SalesDocumentDetailsView` with independent sequences (QT/EST/PO) and per-doc FY numbering.
- Same `igst = 0` intra-state tax computation and (on PO) no standalone PDF download; Print path via `DocPrintSheet` works.
- Conversion to invoice is the entry point for the hard-coded place-of-supply bug (#1 above).

### PART 9–10 — Expenses & Vehicles
- Global `AddExpenseModal` / `AddVehicleModal` / `AddVehicleExpenseModal` wired at the layout level; render and persist via AppContext. Vehicle-number format validation exists (`validateVehicleNumber`).

### PART 11 — Team ✅ (entitlement-gated)
- Team-member creation is centrally gated by the entitlement engine (`checkEntitlement(activePlan, "teamMembers", length)` in AppContext), which raises an upgrade prompt at the limit. No bypass found.

### PART 12 — Business Network / Directory ✅ (entitlement-gated)
- Directory is gated by `directoryEntitlement(activePlan).allowed`; browse / my-business / details all respect the plan gate.

### PART 13/14/15 — Settings, Billing, Financial Year ✅
- Company profile persists; refund-request flow and refund-policy link present; FY create/activate handled by `financialYear.ts` with account-scoped sequences.

### PART 16 — Navigation / Scroll — **not reproduced as a defect**
- Desktop (1280px): 30-customer list scrolls correctly in the `<main overflow-y-auto>` container (reached bottom 1571/2407).
- Mobile (390px): 40-customer list scrolls (wheel/gesture moved scrollTop 0→410). The reported pull-down / stuck-at-bottom issue **did not reproduce** on dashboard/customers/invoices in these probes. Recommend reproducing on the specific screen + data set that originally exhibited it (likely a long form or report) before treating as fixed.

### PART 17–18 — Mobile / Accessibility
- Mobile bottom nav present; no horizontal overflow observed on short pages.
- **P3:** mobile viewport + long tables rely on horizontal scroll inside `overflow-x-auto` wrappers (acceptable, minor).
- Print is driven by `window.print()`; no dedicated `@media print` hiding of chrome was verified (screen+print share the card layout).
- Icon-only buttons ("View", "Edit", "Download") rely on `title` attributes; no `aria-label` on several — minor accessibility note.

### PART 19 — Data Isolation ✅
- Separate browser contexts (Account A vs B). **A sees only its own customer; B only its own.** No cross-tenant localStorage leakage. `ISOLATED_OK`.

### PART 20 — Admin App (:3001) ✅ (demo scope)
- Super Admin login (email+password) works; unauthenticated `/dashboard` redirects to `/login`.
- Pages render: Dashboard, Accounts/Users, Businesses, Business Directory, Plans & Pricing (3 plans), Payments, Activity.
- **Demo limitation (expected, documented in-app):** because `:3000` and `:3001` are different origins, the admin app cannot read the customer app's localStorage; it shows the "Demo data bridge" note and requires same-origin seeding to display business data. Not a defect, but a real platform constraint until a backend exists.
- **P3 (by design):** admin auth is seeded/simulated (`superadmin@bizledger.io` / demo password) — explicitly **not** production security, as documented.

---

## 3. Field Issues Found (Screen / Field / Current / Expected / Issue / Severity)

| Screen | Field | Current | Expected | Issue | Severity |
|--------|-------|---------|----------|-------|----------|
| Invoice create (POS) | Place of Supply | select defaults "Tamil Nadu (33)", label vs code desync on no-interaction | placeOfSupply label and code always consistent | Save without interacting stores label TN but empty code | P1 |
| Convert Qtn→Invoice / Est→Invoice | Place of Supply | hard-coded "Tamil Nadu (33)" | use source quote/estimate (customer) place of supply | Out-of-state invoice shows wrong POS | P1 |
| Invoice (tax) | CGST/SGST/IGST | `igst` always 0, always CGST+SGST | IGST for inter-state, CGST+SGST intra-state | No inter-state tax classification | P1 |
| Invoice list + details | Download PDF | toast only, no file | real PDF download | No PDF generated | P1 |
| Invoice list (empty) | Empty state | "No invoices match your filter criteria." | "No invoices yet — create your first" | Misleading empty-state copy | P2 |
| Customer | State | `<select>` stores name only; no `stateCode` field | store GST state code on Customer | Customer record lacks state code | P2 |
| Onboarding step 3 | State | free-text input | structured select | not structured | P3 |
| Onboarding step 1 | Back button | "Dashboard" → loops to onboarding | "Cancel"/"Back out" or disabled | dead affordance | P3 |
| Signup | Email (invalid) | native browser bubble, no inline error | inline error like other fields | inconsistent validation UX | P3 |
| Product | HSN/SAC | free-text, not required, no format gate at save | optional; validate format on save | HSN not gated until used on invoice | P3 |
| Product | GST rate | 0/5/12/18/28 only | include 0.25 & 3 | dropdown omits valid rates | P3 |
| Customer | GSTIN / Mobile / Pincode / Email | free text, no format check | validate format | no field validation | P3 |
| pricing page | (public access) | auth-gated | reachable pre-login (optional) | plans not visible pre-signup | P3 |
| Admin | admin auth | seeded demo creds | (backend) | simulated, not production | P3 (by design) |

## 4. HSN/SAC — dedicated observation (requirement upheld)
- **HSN/SAC is user-supplied everywhere and is never guessed, inferred, auto-generated, or silently replaced.** Confirmed in the product form (explicit input + "check your HSN" helper) and invoice line editor (editable field that inherits the product HSN as a starting point, user-editable). The only enforcement is a **format** validator (`\d{2,8}`) at invoice-save time — it does **not** invent a code. This satisfies the "user-provided only" rule.

## 5. Summary counts
- **P0:** 0
- **P1:** 4 (POS hard-code on conversion; POS label/code desync; no IGST path; fake PDF download)
- **P2:** 3 (invoice empty-state copy; customer state code not stored; [admin demo bridge is informational])
- **P3:** 10 (various validation / copy / accessibility / navigation nits)
- **Pass gates:** public legal, auth errors, data isolation (Accounts A/B), plan/entitlement gating (team + directory), admin app function. Scroll/pull-down **not reproduced**.

## 6. Recommended fix order (for the NEXT phase, not now)
1. **P1 invoicing correctness** : carry `placeOfSupply`/code from source doc; sync POS code with label on create; add inter-state IGST classification driven by company vs customer state codes.
2. **P1 real PDF** : wire Download to a real PDF render (print-to-pdf / library) instead of a toast.
3. **P2** empty-state copy across invoices (and product/customer lists); store customer `stateCode`.
4. **P3** batch: onboarding free-text state, hide-dead back button, signup inline email error, product GST rate list + HSN gate, field-format validators.
5. **Then** run bug-fix regression, re-audit, and finally implement the field-validation rules (BIZLEDGER-FIELD-VALIDATION-RULES.md) which were kept untouched this phase.

---
*Audit complete. Record-only: no validation, business rule, tax, entitlement, numbering, or HSN behavior was modified during this phase. Simulated payments are not real; frontend admin auth is not production security.*