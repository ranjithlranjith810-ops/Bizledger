# Phase 9A — Landing, Account Creation, Login & Session Restoration

You are working autonomously on the BizLedger frontend.

## IMPORTANT EXECUTION RULES

1. Immediately inspect the real active application before changing anything.
2. The real BizLedger app root is:

   `D:\Startup\biz-web\bizledger-master`

3. Do not work inside:
   - `D:\Startup\biz-web\New folder`
   - `bizledger (1)` through `bizledger (6)`
   - the separate marketing app at the workspace root.

4. Do not narrate tool usage.
5. Actually execute inspection, edits, build, and verification.
6. Continue until this phase is fully complete.
7. Do not stop for approval between subtasks.
8. Preserve the approved BizLedger UI/theme unless a change is required for this flow.
9. Do not add a real backend, database, Firebase, Supabase, or real authentication yet.
10. Use the existing temporary frontend/localStorage architecture.

---

# PRIMARY GOAL

Change the application flow so BizLedger behaves like a real application from the very beginning.

The application must start with this journey:

```text
FIRST VISIT
    ↓
LANDING PAGE
    ↓
Create Account / Get Started
    ↓
Account Creation
    ↓
Business / Workspace Setup if required
    ↓
Enter BizLedger
    ↓
Fresh Empty Business
All business values start at zero
```

After the account has been created:

```text
RETURNING VISIT
    ↓
Restore Local Session
    ↓
Go to the last valid page
```

The user should NOT be forced through account creation again after refreshing or reopening the app.

---

# 1. FIRST-VISIT BEHAVIOR

Inspect the current `/` route and existing landing/account-related UI.

The root behavior must distinguish between:

### A. No account exists

When there is no temporary local account/session:

```text
/
↓
Show Landing Page
```

The user must see the landing page and be able to choose:

* Get Started
* Create Account
* Sign In / Login, if that UI exists or is needed

Do not automatically redirect a brand-new user directly to `/dashboard`.

---

# 2. ACCOUNT CREATION

Create or adapt the frontend-only account creation flow using localStorage.

The account does NOT need real authentication.

Use a simple temporary account/session model appropriate for frontend testing, for example:

```ts
interface LocalAccount {
  id: string;
  name: string;
  email: string;
  businessName?: string;
  createdAt: string;
}
```

Also persist a session state.

The exact implementation may adapt to the existing types/context architecture rather than duplicating state.

After successful account creation:

```text
Account Created
      ↓
Create Local Session
      ↓
Initialize Empty Business Data
      ↓
Redirect into BizLedger
```

Do not load the existing demo seed data automatically for a newly created account.

---

# 3. FRESH BUSINESS MUST START AT ZERO

This is critical.

After creating a new account, the business should begin empty.

Initial values should be:

```text
Customers: 0
Products: 0
Invoices: 0
Sales: ₹0
Revenue: ₹0
Expenses: ₹0
Outstanding: ₹0
Vehicles: 0
Vehicle Expenses: ₹0
```

Lists should display proper empty states instead of fake business records.

Examples:

```text
Customers
No customers yet
[ Add Your First Customer ]

Products
No products yet
[ Add Your First Product ]

Invoices
No invoices yet
[ Create Your First Invoice ]
```

The dashboard must also correctly display zero values.

Do not leave hard-coded dashboard numbers that continue showing sample values after the account starts empty.

---

# 4. TEMPORARY DATA MUST BUILD DURING REAL USE

The purpose of this phase is physical verification.

As the user works through the app:

```text
Add Customer
    ↓
Customer Count changes 0 → 1

Add Product
    ↓
Product Count changes 0 → 1

Create Invoice
    ↓
Invoice Count changes
Sales changes
Customer balance changes where applicable

Add Expense
    ↓
Expense totals change
Dashboard totals change
Reports change

Add Vehicle
    ↓
Vehicle count changes

Add Vehicle Expense
    ↓
Vehicle totals change
Expense totals change where appropriate
```

The numbers must be derived from the current temporary data, not remain static mock values.

---

# 5. RETURNING USER / SESSION RESTORATION

After an account has been created, refreshing the browser must NOT send the user back to:

* Landing
* Create Account
* Onboarding

Instead:

```text
Browser Refresh
      ↓
Read Local Account + Session
      ↓
Restore Application
```

The user should return to the last meaningful route they were using.

For example:

```text
User is working on:
/customers

Refresh
↓
Restore:
/customers
```

Another example:

```text
User is working on:
/settings/billing/history

Close/reopen app
↓
Restore:
/settings/billing/history
```

Implement route restoration safely.

Rules:

1. Only restore routes that actually exist.

2. Never restore an invalid/dead route.

3. If the stored route is invalid, use:

   `/dashboard`

4. Do not restore transient modal state unless the existing architecture already safely supports it.

Store the last valid application route in localStorage or integrate it into the existing temporary session architecture.

---

# 6. LANDING VS LOGGED-IN BEHAVIOR

The intended logic should be conceptually:

```text
No local account/session
    ↓
Landing Page

Account/session exists
    ↓
Restore last valid page

User explicitly logs out
    ↓
Clear active session
    ↓
Landing/Login
```

Do NOT destroy the business data on logout unless the user explicitly chooses a destructive reset.

Separate:

```text
Logout
```

from:

```text
Reset Business Data
Delete Account
Load Demo Data
```

These should not accidentally perform the same action.

---

# 7. LOGIN FOR TEMPORARY FRONTEND TESTING

Since there is no backend authentication yet, implement the simplest clean frontend-only login behavior.

The login page should recognize the locally created account.

Do not pretend this is secure authentication.

This is only for physical frontend testing before the backend phase.

A suitable flow is:

```text
Landing
    ↓
Login
    ↓
Enter matching local account email
    ↓
Restore local session
    ↓
Return to last valid route
```

Avoid passwords unless the existing UI already has them and they are useful for the frontend flow.

Clearly keep the implementation isolated so real authentication can replace it later.

---

# 8. DEMO DATA

The existing Phase 8 demo/reset architecture should be preserved where useful.

However:

## New Account

Must start with:

```text
EMPTY BUSINESS
```

not populated demo data.

## Demo data

May remain available through Settings or Developer/Demo Tools:

```text
[ Load Demo Data ]

[ Reset Business Data ]
```

Expected behavior:

### Load Demo Data

```text
Empty business
↓
Load Demo Data
↓
Populate sample customers/products/invoices/etc.
```

### Reset Business Data

Ask for confirmation.

Then restore the current account's business data to:

```text
Empty state
All numeric values = 0
```

Do not accidentally delete the local account/session unless the action explicitly says so.

---

# 9. MULTIPLE LOCAL ACCOUNTS

Do not over-engineer full multi-user support yet.

However, structure localStorage so the future backend migration is not made harder.

At minimum, avoid tightly coupling all data permanently to a single anonymous global user if a simple account/workspace key can be used.

If practical within the existing architecture:

```text
Account
  └── Workspace / Business
        ├── Customers
        ├── Products
        ├── Invoices
        ├── Expenses
        ├── Vehicles
        └── Other temporary data
```

Keep the solution lightweight.

Do not build a real backend or complex permission system.

---

# 10. ROUTE PROTECTION / FLOW GUARD

Inspect the current routing behavior.

Ensure a new user cannot accidentally land directly on protected app pages and bypass the intended first-time flow.

Example:

```text
New browser
Open:
/dashboard

Expected:
Redirect to Landing or Login
```

After a local session exists:

```text
/dashboard
```

should work normally.

Do not break existing routes.

Verify:

* `/`
* `/dashboard`
* `/customers`
* `/products`
* `/invoices`
* invoice detail
* `/expenses`
* `/vehicles`
* vehicle detail
* `/team`
* `/reports`
* `/settings`
* `/settings/billing`
* `/settings/billing/history`
* `/pricing`

---

# 11. LAST PAGE TRACKING

Implement last valid route tracking.

Whenever the authenticated/local-session user navigates between valid application pages:

```text
/dashboard
/customers
/products
/invoices
...
```

store the current route.

Do not store:

* invalid routes
* 404 routes
* modal-only state
* temporary query state unless required

On session restoration:

```text
lastRoute exists and is valid
    → restore it

otherwise
    → /dashboard
```

---

# 12. NUMERIC VERIFICATION

This phase is specifically intended to verify the real frontend flow and calculations.

Audit the current dashboard and reports.

Remove or replace hard-coded business values where necessary.

Values should update from temporary local data.

At minimum verify:

```text
Customer Count
Product Count
Invoice Count
Total Sales / Revenue
Expenses
Outstanding
Vehicle Count
Vehicle Expenses
Profit / Net value where the current UI represents it
```

Test the progression:

```text
Fresh Account
All = 0

Add Customer
Customer count = 1

Add Product
Product count = 1

Create Invoice
Invoice count increases
Sales/revenue updates

Add Expense
Expense total updates
Net/profit updates if applicable

Delete or reset data
Numbers return correctly
```

Do not invent financial calculations that do not match the existing application's intended terminology.

Inspect the current implementation and preserve its business meaning.

---

# 13. UI REQUIREMENTS

Keep the existing approved BizLedger design.

Use the established:

* DashboardLayout
* SideNavBar
* MobileNav
* TopNavBar
* modal patterns
* toast/notification system
* existing Tailwind theme
* existing empty-state styles where available

Do not introduce a second design system.

Do not redesign completed pages unnecessarily.

---

# 14. PHYSICAL VERIFICATION SUPPORT

The final application should allow the user to manually perform this complete journey:

```text
1. Open application

2. See Landing Page

3. Create Account

4. Enter fresh BizLedger

5. See Dashboard with zero values

6. Add Customer

7. Add Product

8. Create Invoice

9. Verify numbers changed

10. Add Expense

11. Verify totals changed

12. Add Vehicle

13. Add Vehicle Expense

14. Check Reports

15. Refresh browser

16. Confirm data persists

17. Confirm current page is restored

18. Logout

19. Return to Landing/Login

20. Login again

21. Restore the same temporary business data

22. Reset Business Data

23. Confirm values return to zero
```

---

# 15. BUILD AND VERIFICATION

When implementation is complete:

1. Run the production build.
2. Fix all new blocking errors.
3. Verify all existing routes.
4. Verify first-time user behavior with no local session.
5. Verify account creation.
6. Verify fresh zero-state data.
7. Verify temporary data persistence.
8. Verify refresh/session restoration.
9. Verify logout/login restoration.
10. Verify last-route restoration.
11. Verify reset returns the business to zero.
12. Verify existing demo data tools still behave correctly if retained.

Do not claim verification without actually performing it.

---

# FINAL REPORT

Produce a concise but complete report containing:

1. Existing landing/account flow discovered.
2. Files created.
3. Files modified.
4. Local account/session architecture.
5. localStorage keys/schema.
6. First-visit behavior.
7. Account creation behavior.
8. Login/logout behavior.
9. Last-page restoration behavior.
10. Zero-state behavior.
11. Numeric/calculation changes.
12. Demo data/reset behavior.
13. Route protection behavior.
14. Build result.
15. Route verification result.
16. Any remaining limitations before the real backend/auth phase.

The objective is a clean, physically testable BizLedger frontend where the user starts from the landing page, creates an account once, begins with an empty business and zero values, builds data through normal usage, and later returns to where they left off.
