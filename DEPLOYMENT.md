# BizLedger — Staging & Production Deployment

Where code lives (two applications, two delivery concerns):

- **BizLedger (customer app)** — `bizledger-master/`, a Next.js app on port 3000.
  Owns the PostgreSQL database (via Prisma 7) and every `/api/*` route,
  including the Better Auth endpoints. Built and run with Node 22.
- **BizLedger Admin (admin console)** — `bizledger-admin/`, a Next.js app on
  port 3001. Contains **no** server API of its own: `next.config.mjs` rewrites
  `/api/*` to the customer backend target in `BIZLEDGER_API_TARGET`, so every
  request (including auth) reaches the master app. This keeps all authz and
  audit on the backend.

  Both apps are HTTPS-first. Cookie security, HSTS, and the Content-Security
  headers are gated on a **production build over HTTPS** — see
  `next.config.mjs` in each app and `src/lib/auth.ts`.

   **Runtime:** both apps target **Node 22.18.0** and declare it in two places so
   the requirement survives `npm ci`: `engines.node` (`>=22.18.0 <23`) in each
   `package.json` and a `.nvmrc` containing `22.18.0`. Run `nvm use` in each app
   directory before installing or building.

   The floor is **22.18.0, not merely "any 22.x"**, and it is a hard floor. The
   admin console's test runner is Node's own runner pointed straight at `.ts`
   sources (`node --test src/__tests__/*.test.ts`). That requires *unflagged*
   native TypeScript type stripping, which reached the 22.x line in 22.18.0.
   Verified empirically against the real suite:

   | Node     | `node --test src/__tests__/*.test.ts` |
   | -------- | ------------------------------------- |
   | 22.14.0  | `ERR_UNKNOWN_FILE_EXTENSION ".ts"`    |
   | 22.17.1  | `ERR_UNKNOWN_FILE_EXTENSION ".ts"`    |
   | 22.18.0  | 51 tests, 51 pass, 0 fail             |

   Any newer 22.x is fine; anything below 22.18.0 is not, even though the customer
   app alone would still install and build there. (Local verification was also
   carried out on Node 24 for convenience; the production target is 22.18.0.)

  **Customer production origin:** intended `https://bizledger.dev`.
  **Admin console production origin:** `NEEDS OPERATOR INPUT` — undecided by
  design. No Admin hostname appears anywhere in code, configuration or examples
  in this repository.


---

## 1. Environment variables

Configuration is **deployment-dependent**. Nothing below is defaulted to a
production value in source, and no secret is committed. Two clearly distinct
environments:

- **LOCAL** — `localhost:3000` (customer) / `localhost:3001` (Admin). Uses
  `.env.local`. `DATABASE_URL` may point at the local Postgres; `TEST_DATABASE_URL`
  is used by the integration suites and **must never be set in production**.
- **PRODUCTION** — real hostnames, secrets from a secret manager. See the
  tables below. The customer production origin is intended to be
  `https://bizledger.dev`. **The Admin production origin is
  `NEEDS OPERATOR INPUT`** — it has not been decided, so no Admin hostname is
  written into any config, code path or example in this repository.

| Variable | Scope | Required | Notes |
| --- | --- | --- | --- |
| `DATABASE_URL` | local + production | yes | Pooled Postgres connection string (Supabase pgbouncer, port 6543). Runtime reads/writes. |
| `DIRECT_URL` | production | yes | Direct Postgres connection (Supabase, port 5432). Used only by Prisma migrations. **IPv6-only endpoint** — the migration step must run from an IPv6-capable host or through the Supabase session pooler, otherwise the connection fails with `Network unreachable`. |
| `TEST_DATABASE_URL` | local only | no | Disposable PostgreSQL for the integration suites. **MUST be absent in production** (see §11). |
| `BETTER_AUTH_SECRET` | production | yes | ≥32-char random secret. Generate with `npx @better-auth/cli generate-secret`. Shared by all instances. Source: secret manager. |
| `BETTER_AUTH_URL` | production | yes | The app origin **as seen by users** — intended `https://bizledger.dev`. HTTPS here is what enables secure cookies. Better Auth builds every absolute URL from it, including the password-reset / email-verification links delivered by Resend; a placeholder host (e.g. `app.bizledger.test`) is NOT resolvable and makes those links fail in the mail client (`DNS_PROBE_FINISHED_NXDOMAIN`). |
| `NEXT_PUBLIC_APP_URL` | production | recommended | Public app origin used for client-side absolute links. Keep identical to `BETTER_AUTH_URL`. |
| `TRUSTED_ORIGINS` | production | yes | Comma-separated list of origins allowed to make credentialed browser requests. Must include the customer origin **and** the Admin origin once that origin is decided. Ignored for local dev (localhost origins are used). |
| `TRUSTED_PROXIES` | production | set from topology | Comma-separated proxy/LB IP or CIDR entries. **Deployment-dependent — do not guess.** Unset is fail-safe (forwarded headers are ignored and rate limiting degrades to a shared per-path bucket). Populate from the hosting provider once chosen. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | production | optional | OAuth client — omit to disable Google sign-in. See §4 for redirect URIs. |
| `NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED` | production | optional | Set to `true` only alongside real Google credentials. |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | production | no (yes for payments) | Razorpay API keys. |
| `RAZORPAY_WEBHOOK_SECRET` | production | no (yes for payments) | Razorpay webhook signing secret; must match the dashboard/webhook config (§5). When absent the webhook endpoint fails closed with `503`. |
| `RESEND_API_KEY` | production | no | Resend API key (`https://resend.com/api-keys`) for password-reset / email-verification mail. **Without a key (and a verified `MAIL_FROM` domain), transactional mail is skipped and logged as a one-time server warning** (`src/lib/auth/mail.ts`) — nothing sensitive is ever logged. |
| `MAIL_FROM` | production | no | Sender for all transactional mail, e.g. `no-reply@bizledger.io`. The domain MUST be verified in Resend — see §9. |
| `RESEND_WEBHOOK_SECRET` | production | no | Signing secret for the Resend webhook (§9.6). |
| `RESEND_WEBHOOK_BASE_URL` | production | no | Public HTTPS origin that reaches `/api/webhooks/resend`, e.g. `https://bizledger.dev`. |
| `ADMIN_EMAIL` | provisioning only | yes, for §10 | Initial platform administrator address. **No default exists** — the bootstrap script refuses to run without it. Never placed in the running container's environment. |
| `ADMIN_PASSWORD` | provisioning only | yes, for §10 | Initial administrator password, read from the secret manager at run time. Never hardcoded, never printed. |
| `AUTH_RATE_LIMIT_FORCE` | local only | no | Enables database-backed rate limiting outside production. Production enables it unconditionally. |
| `NEXT_PHASE` | local only | no | Development phase marker. |
| `NODE_ENV` | both | set by the runtime | `production` on the deployed app; required for secure cookies, HSTS and production CSP-Report-Only. |

### BizLedger Admin (`bizledger-admin/.env.example` → `.env.production`/`.env.local`)

| Variable | Scope | Required | Notes |
| --- | --- | --- | --- |
| `BIZLEDGER_API_TARGET` | local + production | yes for production | HTTPS origin of the customer backend, e.g. `https://bizledger.dev`. Defaults to `http://localhost:3000` for local dev only. This is the **backend** target, not the Admin's own hostname. |
| Admin console origin | production | **NEEDS OPERATOR INPUT** | The Admin console's production hostname and exposure policy (public / IP-restricted / VPN) are undecided. Nothing in this repository assumes one. Local Admin remains `http://localhost:3001`. |

---

## 2. Staging deploy — customer app

Prereqs: **Node 22.18.0+** (`engines.node >=22.18.0 <23` in `package.json`, `.nvmrc` = `22.18.0`), a reachable Postgres, `.env.local` filled in.

```bash
cd bizledger-master
nvm use            # honours .nvmrc -> Node 22.18.0

# `npm ci` runs `prisma generate` automatically via the `postinstall` hook,
# and `npm run build` runs it again via `prebuild`. A clean checkout therefore
# always has a generated client before TypeScript resolves
# `@/generated/prisma/client`. See the explicit step below for visibility.
npm ci

# 0) Generate the Prisma client (idempotent, no database connection required).
npx prisma generate

# 1) Apply migrations (uses DIRECT_URL, runs from the repo root).
npx prisma migrate deploy

# 2) (First time / when the plan catalog changes) seed static catalog rows.
npx prisma db seed

# 3) Build. `prebuild` regenerates the client first.
npm run build

# 4) Serve. Behind a TLS-terminating proxy/reverse proxy (never expose :3000 raw).
npm run start   # PORT=3000 by default
```

> **Why this matters:** `src/generated/prisma` is git-ignored and has no
> tracked files, while `src/lib/prisma.ts` imports `@/generated/prisma/client`.
> Without a generation step, a clean checkout or CI build fails at compile time.
> `prisma generate` only reads `prisma/schema.prisma` — it does **not** connect
> to any database and never mutates one.

Smoke test after boot:

- `GET /api/health` → `200 {"status":"ok","checks":{"database":"up"}}` (503 → DB problem).
- `GET /api/auth/ok` → Better Auth health.
- Load `/login`; sign in with a seeded account.
- If `RESEND_API_KEY` + `MAIL_FROM` are set: request a password reset and
  confirm the email arrives (§9). The reset/verify links in the mail must start
  with `BETTER_AUTH_URL` — if an email shows a fake host like
  `https://app.bizledger.test`, the environment's `BETTER_AUTH_URL` is a
  placeholder and the link will not resolve (`DNS_PROBE_FINISHED_NXDOMAIN`).

If you deploy under a subpath or different hostname later, update
`BETTER_AUTH_URL` **before** the production build so secure cookies and CSP/HSTS
gate correctly (`useSecureCookies` keys off the build-time `NODE_ENV`).

### Rolling back a code release

The app and database have separate rollback paths:

1. **App**: redeploy the previous build/image. Because better-auth sessions are
   DB-backed and auth flows are forward-compatible, an older build keeps workers
   signed in.
2. **Database**: migrations are forward-only; never hand-edit a production DB to
   "undo" DDL. See `RUNBOOK.md` → *Migration recovery & rollback*.

---

## 3. Staging deploy — admin console

Prereqs: **Node 22.18.0+** (`engines.node >=22.18.0 <23`, `.nvmrc` = `22.18.0`).

```bash
cd bizledger-admin
nvm use            # honours .nvmrc -> Node 22.18.0
npm ci

# Point at the customer backend over HTTPS.
#   echo 'BIZLEDGER_API_TARGET=https://bizledger.dev' > .env.production
npm run build

# Serve behind HTTPS (port 3001 by default).
npm run start
```

Console tests (DB-free, no test framework dependency — Node's own runner):

```bash
npm test                       # all console suites
npm run typecheck              # tsc --noEmit
```

`src/__tests__/` carries its own `package.json` with `{"type":"module"}`. That
scopes ESM to the test directory only, so the suites can use top-level
`await import()` and `import.meta.dirname` without converting the whole Next.js
application to ESM. Nothing under `src/__tests__` is imported by the app, so
production build and runtime semantics are unaffected.

Smoke test:

- Open `/login` — the admin session flows to `BIZLEDGER_API_TARGET` via the
  `/api/*` rewrite and must show the admin gate (admin-role only).
- Open `/dashboard` and confirm data loads (proves the rewrite + backend auth).

Never point the admin console at a production backend from a public box unless
the backend's `trustedOrigins` includes the admin origin and backend admin authz
still resolves to a `PlatformAdmin` row holding `SUPER_ADMIN` or `SUPPORT_ADMIN`
(`src/lib/admin/admin-auth.ts` → `requirePlatformAdminRole`). The proxy allowlist
in `bizledger-admin/proxy-allowlist.mjs` is a **routing** boundary, not
authorization; every Admin API re-checks the role against the database.

**The Admin console's production hostname is `NEEDS OPERATOR INPUT`.** Do not
set `BIZLEDGER_API_TARGET`, `TRUSTED_ORIGINS` or any cookie/redirect origin to a
guessed Admin hostname. Decide the hostname and exposure policy first, then add
it to `TRUSTED_ORIGINS` on the backend.

---

## 4. Google OAuth redirect URIs

Register **one redirect URI per origin** that runs the customer app, in Google
Cloud Console → OAuth 2.0 Client:

```
<APP_ORIGIN>/api/auth/callback/google
```

Examples:
- `https://app.bizledger.example.com/api/auth/callback/google`
- `http://localhost:3000/api/auth/callback/google` (local dev)

The URI must match `BETTER_AUTH_URL` + `/api/auth/callback/google` exactly.

---

## 5. Razorpay test webhook config

1. Dashboard (Test Mode) → Settings → Webhooks → Add Webhook.
2. **URL**: `<APP_ORIGIN>/api/billing/webhook`.
3. **Secret**: paste the same value into `RAZORPAY_WEBHOOK_SECRET` server-side.
   This secret signs every payload; mismatches are rejected.
4. Select events: `payment.captured`, `order.paid`, `subscription.activated`,
   `subscription.completed`, `subscription.updated`, `subscription.charged`,
   plus any event the billing flow listens for (see `src/lib/billing/webhook-service.ts`).
5. Test: use Dashboard → Webhooks → "Send test payload"; verify a 200/2xx and
   a row in the payment tables.

---

## 6. TLS / HTTPS

- BOTH apps must be served over HTTPS in any non-local environment. Use a
  platform reverse proxy / edge (e.g. a load balancer, cloudfront-like edge, or
  Caddy/nginx on the VM) for certificate issuance and termination, then run the
  Node apps on loopback (`127.0.0.1`).
- `BETTER_AUTH_URL` starts with `https://` in staging/production. This enables
  `useSecureCookies` and the HSTS/CSP-Report-Only headers.
- Do not disable TLS for IP-restricted test boxes — auth cookies and webhook
  signatures assume the HTTPS posture.

### 6.1 Rate limiting & client-IP trust

- Auth rate limits are enforced with the shared PostgreSQL `rate_limit` table
  (per-proxy `count`, 60s/100 default; tighter per-path rules for sign-in,
  sign-up and every password-reset endpoint). Settings live in
  `bizledger-master/src/lib/auth.ts` → `rateLimit`.
- The app resolves the REAL client IP from `X-Forwarded-For` ONLY when
  `TRUSTED_PROXIES` names your true reverse proxies (comma-separated IPs/CIDRs,
  e.g. `10.0.0.4, 192.0.2.10/32`). Set it in `.env.local` on deployed hosts.
- If `TRUSTED_PROXIES` is empty in production, the app refuses to trust any
  client-supplied forwarded header and per-IP limiting degrades to one shared
  per-path bucket — coarser, but never spoofable. A boot-time warning reminds
  you to set it. Local dev keeps Better Auth's default single-value-header
  behavior for the throttle test suites.
- Password reset has a SECOND, per-EMAIL budget independent of IP (max 5
  requests per address per 300s; keyed by SHA-256 of the normalized email in
  the same `rate_limit` table). It always applies, whatever the IP. Requesting
  a new reset also invalidates all earlier unused reset links for that user,
  and a successful reset revokes that user's sessions. None of these reveal
  whether an email has an account and nothing sensitive is ever logged.
- **Production checklist:** confirm `TRUSTED_PROXIES` lists only your
  LB/edge/proxy addresses; confirm `/api/auth/*` is only reachable through the
  proxy; verify a request with a forged `X-Forwarded-For` cannot dodge the IP
  limit.

### 6.2 Production security checklist

- `BETTER_AUTH_URL` starts with `https://` and is a real, resolvable origin
  (never a placeholder host) — seeded in `.env.local` before build.
- `BETTER_AUTH_SECRET` is a fresh long random string (32+ chars) and differs
  from every other environment.
- `TRUSTED_PROXIES` is set (see §6.1). `TRUSTED_ORIGINS` lists only real
  cross-origin clients if the admin console is a separate origin; wildcards are
  always rejected. The customer app itself is always allowed (same origin).
- `RESEND_API_KEY` lives only on the server (a leaked NEXT_PUBLIC_RESEND_API_KEY
  is a production-blocking misconfiguration; nothing of it ships in the bundle).
- Razorpay keys and `RAZORPAY_WEBHOOK_SECRET` are server-only.
- Confirm session-cookie policy is secure (production + https → `useSecureCookies`).
- Confirm `requireEmailVerification` stays off until account email-verification
  is explicitly enabled and rolled out in this codebase.

---

## 7. Monitoring

Probe targets (no auth, sanitized output only — no URLs, schema, stack traces,
or secrets):

| Target | Meaning |
| --- | --- |
| `GET /api/health` | App process + DB registration (`SELECT 1`, 3 s timeout). `200` = ok, `503` = degraded. |
| `GET /api/auth/ok` | Better Auth route hosted. Add auth-specific checks here (e.g. session sizing at your monitoring layer). |

Alerting thresholds to start with: `/api/health` non-200 for >30 s, and any RR
(rolling-restart) outage of the storage pods if the DB probe fails.

**Error monitoring integration point**: wrap failures at the API boundary.
`sentry`-class error capture should be added in:

- `src/lib/business/api-error.ts` (`handleApiError`) — attach the error *id* to
  the response and forward the original error to your monitor, then rethrow a
  sanitized message. Never forward `error.message` that could contain
  query text, connection strings, or tokens.
- Raw exceptions in server actions / route handlers should go through the same
  helper so nothing sensitive reaches response bodies.
- Auth-layer mail handlers (`src/lib/auth.ts`) must NOT be instrumented with
  message bodies: reset/verification URLs and tokens are credentials and are
  never logged (see `src/lib/auth/mail.ts`).

---

## 8. Rollback & recovery index

- Database restore / backup verification / operator-approval gate →
  **`RUNBOOK.md`**.
- Migration forward & rollback → `RUNBOOK.md` → *Migration recovery & rollback*.
- Admin console version-control & CI onboarding → see the *Admin repository
  readiness* section of the Phase 9C-5H report (repo is currently untracked
  inside the workspace checkout — do **not** commit it until reviewed).

---

## 9. Resend setup (transactional mail)

BizLedger sends password-reset, email-verification (and verification-resend) mail
through the official `resend` SDK (`src/lib/auth/mail.ts`). No other mail vendor
is used.

### 9.1 Domain verification & DNS records

Delivery uses the `MAIL_FROM` domain, which must be **verified in Resend**:

```bash
# 1) Add the sending domain, e.g. bizledger.io, at
#    https://resend.com/domains -> "Add Domain".
# 2) Resend presents DNS records to publish with the DNS provider:
#      - DKIM:  several CNAME records (name like "resend._domainkey.<domain>")
#               pointing at "sending.dkim.<resend-region>.email"
#      - SPF:   if no SPF record exists yet, a TXT record like
#               v=spf1 include:amazonses.com ~all
# 3) Wait until Resend shows the domain as "Verified" (may take minutes-hours
#    depending on DNS propagation) BEFORE relying on delivery.
```

> `MAIL_FROM` MUST use this verified domain (e.g. `no-reply@bizledger.io`).
> Emails from an unverified domain are rejected by Resend.

### 9.2 API key configuration

1. `https://resend.com/api-keys` → "Create API Key" → scope it to the verified
   domain above.
2. Store it as `RESEND_API_KEY` in the server env (never in `NEXT_PUBLIC_*` —
   mail is server-only code, guarded by `server-only`).
3. In test mode Resend only delivers to the account owner's addresses unless
   sandbox settings are changed; use the dashboard "Logs" tab to review attempts
   during integration.

### 9.3 Local testing

- Reset/verification mail is **skipped** (with a one-time server warning) when
  `RESEND_API_KEY`/`MAIL_FROM` are unset — local flows keep working.
- Build the reset token manually when needed: use the app's own request flow
  (`POST /api/auth/request-password-reset`) and read the fresh token from the
  DB (`verification` table, `identifier = reset-password:<token>`) for manual
  browser tests (RUNBOOK.md §8).
- **Reset emails always link to the app page** (`<origin>/reset-password/<token>`).
  The `sendResetPassword` hook in `src/lib/auth.ts` builds that link itself from the
  hook's `token` argument and ignores the `url` Better Auth provides (that `url` points
  at Better Auth's own `/api/auth/reset-password/<token>` callback, which server-redirects
  away from the reset form — fresh tokens land on the callback/error URL, stale/expired
  ones on `?error=INVALID_TOKEN` / `/api/auth/error`). A `before` hook forwards any such
  callback request back to the app page (302) so old links keep working. The client never
  passes `redirectTo` to `/api/auth/request-password-reset`.
- To test real delivery locally: set a dev-only `RESEND_API_KEY` + `MAIL_FROM`
  on a verified domain, then check the Resend dashboard → Logs.

### 9.4 Production deployment

- Set `RESEND_API_KEY` and `MAIL_FROM` in the server environment for the
  deployed instance (staging + production); no code change required.
- After deploy, run the smoke test in §2 plus the email smoke list in
  `RUNBOOK.md` §8. Do not claim real email delivery works until a manual smoke
  test has received an actual message.

### 9.5 Troubleshooting

| Symptom | Likely cause / fix |
| --- | --- |
| Server log `[auth/mail] Transactional mail is NOT configured` | `RESEND_API_KEY` and/or `MAIL_FROM` unset → set both, restart. |
| Delivery rejected for the "from" address | `MAIL_FROM` domain not verified in Resend (§9.1). |
| Emails only arrive for owner addresses | Resend test-mode sandbox → use a verified domain / production mode, or allow-list the recipient. |
| `Mail delivery failed (resend HTTP <code>)` | Resend API returned an error; check dashboard → Logs for the exact reason (the app error stays generic on purpose). |
| `Mail delivery failed (resend)` | Network/timeout to `api.resend.com`; retry / check egress. |

### 9.6 Resend webhook (`/api/webhooks/resend`)

Resend can deliver email lifecycle events (sent / delivered / bounced /
complained / failed / opened / clicked / …) back to the app for password-reset
and email-verification instrumenting. The endpoint is implemented at
`src/app/api/webhooks/resend/route.ts` (handler: `src/lib/email/resend-webhook-service.ts`).

- **Verification** uses Standard Webhooks (Svix) signing — the same mechanism
  the `resend` SDK uses internally — via the explicit `standardwebhooks`
  dependency. Only the `RESEND_WEBHOOK_SECRET` value is required (no API key).
- **To configure**:
  1. Set `RESEND_WEBHOOK_BASE_URL` to the public/forwarded origin the endpoint
     is reachable at (see §9.7 for local forwarding from VS Code — never
     hard-code a `localhost`/forwarded URL into the repo). The app builds the
     endpoint as `RESEND_WEBHOOK_BASE_URL + /api/webhooks/resend` (see
     `src/lib/email/resend-webhook-config.ts`); `getResendWebhookUrl()` fails
     loudly instead of returning an invalid URL when the base is unset.
  2. In Resend → **Webhooks** → *Add endpoint* → URL:
     `POST <RESEND_WEBHOOK_BASE_URL>/api/webhooks/resend`.
  3. Copy the **Signing Secret** (a `whsec_…` string) into the server env as
     `RESEND_WEBHOOK_SECRET`.
  4. Without `RESEND_WEBHOOK_SECRET` the endpoint answers **503** so Resend
     keeps retrying until the secret is configured — it never accepts unsigned
     deliveries.
- **Guarantees**: signature verified over the *raw* body; replies are minimum
  `{ received: true }` (200) for every durable outcome, generic `400` for
  invalid signature / malformed payload, `503` when unconfigured. Delivery
  events are recorded idempotently into the **existing** `webhook_event` table
  (unique `eventId` = the `webhook-id` header) — the same durable inbox the
  Razorpay webhook uses; no new table is introduced. Payloads are stored
  **redacted** (only type + created-at + email id); from/to/subject and email
  bodies are never persisted or logged.
- **Selecting events**: in the Resend dashboard pick the `email.*` events (at
  minimum `email.sent`, `email.delivered`, `email.bounced`, `email.complained`,
  `email.failed`). Other `email.*` types are acknowledged safely; non-email
  event types are acknowledged without action.

### 9.7 Receiving webhooks from Resend during local dev (VS Code)

When the app runs on your machine (e.g. `localhost:3000`), Resend needs a
public URL that forwards to it.

- **Recommended**: use **VS Code port forwarding** on port `3000`; set
  `RESEND_WEBHOOK_BASE_URL=https://<VS_CODE_FORWARDED_DOMAIN>` (no path) to the
  `https://…vscode…` URL VS Code shows for the forwarded port, then create the
  Resend webhook at
  `POST <RESEND_WEBHOOK_BASE_URL>/api/webhooks/resend`. Copy the signing secret
  into `RESEND_WEBHOOK_SECRET`.
- When the forwarded URL changes, update `RESEND_WEBHOOK_BASE_URL` in
  `.env.local` only — the app derives the endpoint entirely from env
  (`RESEND_WEBHOOK_BASE_URL` + `/api/webhooks/resend`); it does not read or
  persist any forwarding URL. Nothing here hard-codes a domain.
- Deliveries still go to **real user inbox addresses** (never a local relay);
  forwarding only lets Resend reach the running app.
---

## 10. First platform administrator (one-time provisioning)

The Admin console has **no** sign-up path of its own: authorization resolves
server-side against a `platform_admin` row (`src/lib/admin/admin-auth.ts`).
Until at least one such row exists, the Admin console cannot be used. Create the
first one with `scripts/bootstrap-admin.ts`.

```bash
cd bizledger-master

# Both variables are REQUIRED. There is no default for either, and no
# administrator address is hardcoded in the script. ADMIN_PASSWORD must come
# from your secret manager and is never printed or logged.
ADMIN_EMAIL=<verified-admin-email> \
ADMIN_PASSWORD=<secret-from-secret-manager> \
npx tsx scripts/bootstrap-admin.ts
```

PowerShell:

```powershell
$env:NODE_OPTIONS   = "--conditions=react-server"
$env:ADMIN_EMAIL    = "<verified-admin-email>"
$env:ADMIN_PASSWORD = "<secret-from-secret-manager>"
npx tsx scripts/bootstrap-admin.ts
```

Behaviour:

- **Fails closed.** A missing, blank or malformed `ADMIN_EMAIL` aborts with a
  clear message before any database access. `ADMIN_PASSWORD` (≥8 characters)
  is likewise required.
- **Idempotent.** Re-running reuses the existing Better Auth user and the
  existing `platform_admin` row. It never duplicates an account, never resets an
  existing password, and never changes an existing role.
- **Password-free by construction.** The credential account is created through
  Better Auth's own `signUpEmail` flow, so Better Auth performs the hashing.
  The script holds no password value in source and logs only ids, role and
  created/reused flags.
- First row created is `SUPER_ADMIN`. Granting further admins, and suspending
  any of them, is done through the Admin console or the database — and note the
  `platform_admin_log` audit trail is append-only with `onDelete: Restrict`, so
  an administrator who has acted cannot be deleted; suspend the user instead.

Guard rails are covered by `src/__tests__/bootstrap-admin-guard.test.ts`
(`npm run test:bootstrap-guard`), which is DB-free.

---

## 11. Tests & CI

Customer app — static/DB-free suites run with no database:

```bash
npm run test:email
npm run test:resend-webhook-config
npm run test:bootstrap-guard
```

Integration suites require a **disposable** PostgreSQL supplied through
`TEST_DATABASE_URL`, applied with `npx prisma migrate deploy` against that
database only, plus the shared fixtures:

```bash
npm run test:invoice
npm run test:sales-doc
npm run test:sales-doc-edit
npm run test:company-profile
npm run test:role-grant
npm run test:directory
npm run test:entitlements-core
npm run test:doc-entitlement-conversion
npm run test:doc-lifecycle-rules
npm run test:company-snapshot-signature
npm run test:directory-feature-entitlement
```

Additional `node:test` suites live in `src/__tests__/` and can be run
individually with `npx tsx <file>`. **Never** point a test run at production:
`TEST_DATABASE_URL` must be absent from the production environment, and the
integration suites truncate their target schema.

Admin console — see §3; all suites are DB-free and server-free.
