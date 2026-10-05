# BizLedger — Database Backup & Restore Runbook

Applies to the BizLedger customer app (`bizledger-master`) PostgreSQL database.
The canonical protection posture: **Supabase automatic daily backups + manual
`pg_dump` exports stored off-site, and point-in-time recovery (PITR) enabled on
a paid plan.** No process ever runs a destructive restore against production
without an explicit, second approver step — see §6.

Two connection strings exist (`.env.local`):

- `DATABASE_URL` — **pooled** runtime connection (Supabase pgbouncer, port
  `6543`). Never use the pooler for backups/restores: it is connection-limited
  and holds prepared statements.
- `DIRECT_URL` — **direct** connection (Supabase, port `5432`). Use this for
  `pg_dump`, `pg_restore`, and `psql` during maintenance windows.

---

## 1. Backup targets (RPO / RTO)

| Tier | Means | RPO | Notes |
| --- | --- | --- | --- |
| Scheduled | Supabase dashboard daily/nightly backups (+ PITR on paid plans) | ≤24 h (PITR: minutes) | Enable PITR — it is the primary restoration path for accidental data loss. |
| Manual | `pg_dump --format=custom` (below) | as-run | Off-site copy (object storage, separate account). |
| Migration | `npx prisma migrate dev` generates the SQL delta | n/a | Keep every migration committed: the migration history is the schema restore path. |

Treat backups as **credentials**: they contain customer PII, business records,
password hashes, and subscription data. Encrypt at rest, restrict access,
never place them in the repo.

---

## 2. Manual backup

```bash
cd bizledger-master
source .env.local   # export DATABASE_URL DIRECT_URL

pg_dump \
  --dbname "$DIRECT_URL" \
  --format=custom \
  --file="bizledger-$(date +%Y%m%d-%H%M).dump" \
  --no-owner --no-privileges
```

Verify the file before archiving:

```bash
pg_restore --list bizledger-20260917-1230.dump | head -20
```

Checks: the file lists tables (user, business, invoice, …), migrates cleanly
via `pg_restore --dry-run`.

---

## 3. Restore (disaster recovery)

Target: a **new** database (Supabase project or fresh Postgres). Restoring
onto a live production database is a destructive overwrite — go through §6
approval first.

```bash
cd bizledger-master
pg_restore \
  --dbname "$DIRECT_URL" \
  --clean --if-exists --no-owner --no-privileges \
  bizledger-20260917-1230.dump
```

Then re-apply/verify the schema marker state:

```bash
npx prisma migrate deploy
npx prisma migrate status   # expect: database schema is up to date
```

> `pg_restore --clean` drops existing objects. Use it only on a database you
> are *intending* to replace and only with the approval in §6.

---

## 4. Migration recovery & rollback

Prisma 7 migrations live in `prisma/migrations/`. The runtime marker table is
`_prisma_migrations`; a migration that already applied is recorded there.

**Forward (apply pending):**

```bash
cd bizledger-master
npx prisma migrate deploy    # idempotent; applies only unchanged-pending migrations
npx prisma migrate status    # verify
```

**Rollback policy:**

- Migrations in this repo are **forward-only by convention**. Do not casually
  remove them: dropping a migration that is already recorded in
  `_prisma_migrations` and re-running `migrate deploy` will be viewed as a new
  (empty) migration and can drift the schema from the code.
- To *roll back a schema change already deployed to production:*
  1. Restore the previous database state from a backup (PITR or the last good
     custom dump) — this is a destructive operation: §6 approval required.
  2. Or write a **new** forward migration that reverses the change (non-
     destructive; preferred when the change can be undone in-place, e.g.
     re-adding a nullable column then backfilling). Ship the reversing
     migration in the same release as the app rollback.
- If a migration **failed partway** (DB is mid-DDL): fix the migration file,
  then `prisma migrate resolve --rolled-back <name>` followed by
  `npx prisma migrate deploy` to retry cleanly. Do not hand-edit tables to
  "complete" a failed migration.

---

## 5. Staging restore-test checklist

Before every production backup/restore change is trusted, run restore against a
**staging** database:

- [ ] `<env>` `.env.staging` uses a separate Supabase project (never the
      production project).
- [ ] Restore the latest `.dump` with `pg_restore --clean --if-exists`
      (staging DB is disposable).
- [ ] `npx prisma migrate deploy` reports up-to-date.
- [ ] Add a smoke business/user, authenticate end to end, and confirm
      `GET /api/health` → `{"status":"ok","checks":{"database":"up"}}`.
- [ ] Confirm the seeded plan catalog present (`npx prisma db seed` is
      idempotent).
- [ ] Delete the staging database’s restored PII afterward if it is not reset.

---

## 6. Operator-approval gate (destructive operations)

The following require a **second approver** (a different human operator) before
execution, logged in the incident journal with the reason and rollback plan:

- `pg_restore`/ANY restore against a database that currently holds production
  data.
- `DROP DATABASE` / `DROP SCHEMA` / truncation of business tables.
- Any `prisma migrate resolve` or hand SQL on the production DB.
- PITR rewinds outside the agreed RPO.

Procedure: ticket → two operators confirm the dump checksum & destination →
executed from a jump host → verified with `npx prisma migrate status` and the
smoke checklist of §7 → journal written.

---

## 7. Post-restore smoke checklist (production)

- [ ] `npx prisma migrate status` — no drift against the deployed release.
- [ ] `GET /api/health` → `200 ok`.
- [ ] Sign in with a known account; confirm session + a recent invoice/business.
- [ ] Razorpay webhook sends a test payload and returns 2xx (secret unchanged).
- [ ] Google OAuth sign-in succeeds (redirect URI unchanged).
- [ ] Confirm that encrypted-at-rest secrets (OAuth/Razorpay/Resend API keys) were
      NOT altered by the restore (they live in env, not the DB).

---

## 8. Mail & monitoring during incidents

- Password-reset / verification mail only sends if `RESEND_API_KEY` + `MAIL_FROM`
  (Resend-verified domain) are configured; if not, those features skip mail with
  a one-time server warning — user-facing responses are unchanged (see
`src/lib/auth/mail.ts`). After a restore, verify the Resend config separately —
   the DB cannot restore env secrets. Manual email smoke test steps:
   1. Request a password reset → confirm the email arrives (Resend dashboard → Logs).
   2. Open the reset link → set a new password.
   3. Confirm the old password fails and the new one works.
   4. Request email verification → confirm the verification email arrives.
   5. Verify the email; confirm a tampered/expired link shows the error state.
   - **Test-mode sender restriction:** with the temporary `MAIL_FROM=onboarding@resend.dev`
     test sender, Resend only delivers to the account owner's own address — mail to any
     other recipient is rejected (API 403) and no delivery occurs. Use a Resend-verified
     domain (`no-reply@bizledger.io`, once `bizledger.io` DNS/DKIM is verified) for real
     recipients. (See DEPLOYMENT.md §9.)
- **Resend webhook (`POST /api/webhooks/resend`) — incident checks:**
   - If reset/verification emails are sent but look undelivered, confirm in Resend →
     → Webhooks/Logs that delivery events are reaching `https://<host>/api/webhooks/resend`.
   - Verify `RESEND_WEBHOOK_SECRET` (`whsec_…`) is set in the server env: without it the
     endpoint returns **503** and Resend retries until the secret is configured.
   - Events are recorded idempotently in the `webhook_event` table (`eventId` = the
     `webhook-id` header, same durable inbox as Razorpay). Look for
     `resend-webhook: processed` in the server logs; `INVALID_SIGNATURE` / `MALFORMED_*`
     audit rows mean the secret or the endpoint URL is wrong.
   - During local dev use VS Code port forwarding (§ DEPLOYMENT.md → 9.7) — never
     hard-code a `localhost` or forwarded URL; directing Resend at `localhost` does not
     work and nothing in the repo persists a forwarding URL.
- **Reset-link forwarding (email → app):** reset emails always link to the app page
  `http://localhost:3000/reset-password/<token>`. The `sendResetPassword` hook in
  `src/lib/auth.ts` builds that link itself from the hook's `token` argument and ignores
  the `url` Better Auth provides — in this version that `url` points at Better Auth's own
  `/api/auth/reset-password/<token>` callback, which server-redirects the browser away
  from the reset form (fresh tokens land on the callback/error URL, stale/expired ones on
  `?error=INVALID_TOKEN` / `/api/auth/error`). Any request that still arrives at that
  callback route is forwarded to the app page by a Better Auth `before` hook (302), so
  older emails keep working. The client should also not pass `redirectTo` to
  `/api/auth/request-password-reset` (it only adds `callbackURL=` noise).
- **Multiple resets:** each request creates an independent single-use token; new requests
  do NOT invalidate older tokens (each stays valid until used/expired). The newest email
  always contains an active token, and stale emails still work rather than confusingly
  failing. Single-use and expiry protection are never weakened.
- Watch `/api/health` and `/api/auth/ok` (§ `DEPLOYMENT.md` → Monitoring) during
  and after the window.