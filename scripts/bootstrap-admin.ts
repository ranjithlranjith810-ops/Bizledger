// Phase 8C.1 — Initial Platform Administrator bootstrap.
//
// DB-BACKED, IDEMPOTENT, PASSWORD-FREE-BY-CONSTRUCTION:
//   - The initial account is created through Better Auth's OWN credential
//     sign-up flow (auth.api.signUpEmail), so the password is hashed with
//     Better Auth's KDF inside Better Auth. This source file NEVER contains or
//     prints a password, and no plaintext password is written into
//     source/migrations/seeds/API responses/logs/audit rows/localStorage.
//   - ADMIN_PASSWORD is read from the environment (.env.local / process env)
//     and MUST be supplied by the project owner at run time. If it is absent
//     the script aborts — it never invents a default password.
//   - ADMIN_EMAIL is REQUIRED for the same reason: there is no default. A
//     hardcoded default previously allowed a typo'd or wrong-domain address to
//     be silently bootstrapped as SUPER_ADMIN. The script now refuses to run
//     unless an explicit, valid address is supplied, and no personal email
//     address is embedded in this source file.
//   - Idempotent: re-running finds the existing Better Auth user and existing
//     PlatformAdmin row and reuses them (no duplicates), never resets an
//     existing user's password, and never downgrades/raises an existing role
//     unexpectedly (the first-created row is assigned SUPER_ADMIN).
//
// Run (from bizledger-master) — ADMIN_EMAIL has no default and must be set:
//   $env:NODE_PATH        = "D:\Startup\biz-web\bizledger-master\node_modules"
//   $env:NODE_OPTIONS     = "--conditions=react-server"
//   $env:ADMIN_EMAIL      = "<verified-admin-email>"
//   $env:ADMIN_PASSWORD   = "<secret-from-secret-manager>"
//   npx tsx scripts/bootstrap-admin.ts

import dotenv from "dotenv";
import { pathToFileURL } from "node:url";

// Load .env.local BEFORE any module that reads DATABASE_URL / auth config
// (mirrors prisma/seed.ts).
dotenv.config({ path: ".env.local" });

import { normalizeEmail, isValidEmail } from "../src/lib/auth/email-validation";

export const ADMIN_EMAIL_REQUIRED_MESSAGE =
  "ADMIN_EMAIL is required and has no default. Set it explicitly to the verified administrator address " +
  "(e.g. $env:ADMIN_EMAIL = \"you@your-domain.com\") and re-run. No email address is hardcoded in this script.";

const DEFAULT_ADMIN_NAME = "BizLedger Super Admin";
const SUPER_ADMIN_ROLE = "SUPER_ADMIN" as const;

export interface BootstrapPlatformAdminResult {
  email: string;
  role: "SUPER_ADMIN";
  userId: string;
  adminId: string | null;
  /** True when a new Better Auth user account was created. */
  userCreated: boolean;
  /** True when a new PlatformAdmin row was created. */
  adminCreated: boolean;
}

/**
 * Resolve and validate the administrator email.
 *
 * There is deliberately NO default: an omitted, blank or malformed
 * ADMIN_EMAIL throws instead of silently selecting an address. Exported
 * separately from {@link bootstrapPlatformAdmin} so this guard is testable
 * without a database connection.
 */
export function resolveBootstrapEmail(opts: { email?: string } = {}): string {
  const raw = (opts.email ?? process.env.ADMIN_EMAIL ?? "").trim();
  if (!raw) {
    throw new Error(ADMIN_EMAIL_REQUIRED_MESSAGE);
  }
  const email = normalizeEmail(raw);
  if (!isValidEmail(email)) {
    throw new Error(
      `Invalid ADMIN_EMAIL value: "${raw}". Provide a valid address; no default is applied.`,
    );
  }
  return email;
}

/**
 * Idempotent initial-admin bootstrap. The password comes from the environment at
 * run time (ADMIN_PASSWORD) — it is never read from source. Safe to call
 * repeatedly; never duplicates accounts or resets existing passwords.
 */
export async function bootstrapPlatformAdmin(opts: {
  email?: string;
  password?: string;
}): Promise<BootstrapPlatformAdminResult> {
  const email = resolveBootstrapEmail(opts);
  const password = opts.password ?? process.env.ADMIN_PASSWORD;

  const { prisma } = await import("../src/lib/prisma");
  const { auth } = await import("../src/lib/auth");

  if (!password) {
    throw new Error(
      "ADMIN_PASSWORD is required. Provide it via the environment (e.g. .env.local / ADMIN_PASSWORD) — it is never hardcoded.",
    );
  }
  if (password.length < 8) {
    throw new Error("ADMIN_PASSWORD must be at least 8 characters.");
  }

  // 1. Reuse an existing Better Auth user (idempotent). When absent, create the
  //    credential account through Better Auth's OWN sign-up flow so the
  //    password is hashed by Better Auth, not by this script.
  let existing = await prisma.user.findUnique({ where: { email } });
  const userCreated = !existing;

  if (!existing) {
    const origin = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
    await auth.api.signUpEmail({
      headers: new Headers({ "content-type": "application/json", origin }),
      body: { email, password, name: DEFAULT_ADMIN_NAME },
    });
    existing = await prisma.user.findUnique({ where: { email } });
    if (!existing) {
      throw new Error("Admin user creation failed after Better Auth sign-up.");
    }
  }

  // 2. PlatformAdmin row — create once (SUPER_ADMIN); reuse if already present
  //    and never change an existing role.
  let admin = await prisma.platformAdmin.findUnique({ where: { userId: existing.id } });
  const adminCreated = !admin;
  if (!admin) {
    admin = await prisma.platformAdmin.create({
      data: { userId: existing.id, role: SUPER_ADMIN_ROLE },
    });
  }

  return {
    email,
    role: SUPER_ADMIN_ROLE,
    userId: existing.id,
    adminId: admin.id,
    userCreated,
    adminCreated,
  };
}

async function main(): Promise<void> {
  const result = await bootstrapPlatformAdmin({});
  // NEVER log the password. Only ids/status are reported.
  console.log(
    `bootstrap-admin OK: email=${result.email} role=${result.role} ` +
      `userCreated=${result.userCreated} adminCreated=${result.adminCreated} ` +
      `userId=${result.userId} adminId=${result.adminId}`,
  );
  if (result.userCreated) {
    console.log("Created a new Better Auth account (password managed by Better Auth).");
  } else {
    console.log("Reused the existing Better Auth account — password was NOT reset.");
  }
  if (result.adminCreated) {
    console.log("Created a new PlatformAdmin row with SUPER_ADMIN role.");
  } else {
    console.log("Reused the existing PlatformAdmin row — role left unchanged.");
  }
}

// Run only when this file is the entry point (so the function stays importable
// for tests/automation without double-initializing).
const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  void main().catch((error: unknown) => {
    console.error(
      "bootstrap-admin FAILED:",
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  });
}