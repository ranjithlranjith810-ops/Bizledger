// Better Auth server configuration.
//
// - Uses the Prisma adapter backed by PostgreSQL.
// - Email/password authentication is always enabled.
// - Google OAuth is OPTIONAL: it is only registered when both GOOGLE_CLIENT_ID
//   and GOOGLE_CLIENT_SECRET exist in the environment (see .env.example).
//   Missing credentials leave email/password fully functional and the UI hides
//   the Continue-with-Google button (src/components/auth/GoogleSignInButton).
//   No credential value is ever referenced here as a literal or a fallback.
//
// Google redirect URIs you must register in the Google Cloud Project
// (Authorized redirect URIs), one per deployment origin of THIS app:
//   http://localhost:3000/api/auth/callback/google  (local dev)
//   https://<your-domain>/api/auth/callback/google  (production)
//
// The Better Auth `User` is a person/account identity and is deliberately kept
// distinct from the future `Business` tenant (multi-tenant architecture).

import { betterAuth } from "better-auth";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { isValidEmail, EMAIL_INVALID_MESSAGE } from "@/lib/auth/email-validation";
import { googleOAuthEnabled } from "@/lib/auth/oauth-config";
import {
  sendPasswordResetMail,
  sendVerificationMail,
} from "@/lib/auth/mail";
import {
  consumeEmailResetBudget,
  EMAIL_RESET_MAX_PER_WINDOW,
  RESET_RATE_LIMIT_MESSAGE,
  invalidatePriorResetTokens,
} from "@/lib/auth/reset-protection";
import {
  parseTrustedOrigins,
  resolveIpAddressConfig,
} from "@/lib/auth/trust-config";

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const googleEnabled = googleOAuthEnabled(googleClientId, googleClientSecret);

// Secure auth cookies only when the deployment is HTTPS AND built for
// production — never keyed on the URL string alone. Explicit (not the default
// URL-derived heuristic) so a stray http:// value in the environment can never
// silently weaken cookie transport in a production build.
const baseIsHttps = (process.env.BETTER_AUTH_URL ?? "").startsWith("https://");
const useSecureCookies = process.env.NODE_ENV === "production" && baseIsHttps;

// Password-reset and email-verification token semantics:
// - Reset tokens are DB-backed, single-use, and expire after this window.
// - A NEW reset request invalidates every earlier unused reset token for the
//   same user (before-hook cleanup in this file): after the request completes,
//   exactly one active reset token exists, so a stale email link can never
//   succeed once a newer reset was requested. Email-verification tokens are
//   never affected (different identifier prefix).
// - A successful reset revokes the user's existing sessions
//   (`revokeSessionsOnPasswordReset`).
// - Verification tokens are signed JWTs that become idempotent once the user is
//   already verified.
const AUTH_TOKEN_EXPIRES_IN_SECONDS = 3600;
const AUTH_TOKEN_EXPIRES_IN_MINUTES = 60;

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
    // Password recovery links are delivered through the mail abstraction
    // (src/lib/auth/mail.ts). The reset token and URL are handled ONLY inside
    // the message body — they are never logged and never land in error text.
    //
    // The email link is built HERE against the APP page, deliberately ignoring
    // the `url` Better Auth provides. In this Better Auth version the provided
    // url always points at its own server callback route
    // (`<origin>/api/auth/reset-password/<token>?...`), which server-side
    // redirects the browser to a callback/error URL instead of showing the
    // reset form. Our own link (`<origin>/reset-password/<token>`) renders the
    // form, and the page itself redirects to /login after a successful save.
    // The token passed to the hook is the SAME DB-backed single-use token; the
    // change is cosmetic (link shape only) — expiry, single-use, rate limiting,
    // and origin checks are unchanged.
    sendResetPassword: async ({ user, token }) => {
      const origin = process.env.BETTER_AUTH_URL;
      const resetPath = `/reset-password/${encodeURIComponent(token)}`;
      const appUrl = origin ? `${origin}${resetPath}` : resetPath;
      // Fire-and-forget: the send is NOT awaited so a reset request for an
      // existing account returns with the SAME latency as one for an unknown
      // account. Better Auth awaits this hook for real users, and for a raw
      // Resend round-trip that would be a timing side channel revealing
      // account existence (unknown users never reach this hook). The response
      // contract is unchanged — Better Auth answers the generic "check your
      // email" 200 regardless of delivery outcome. The mail module already
      // surfaces failures as sanitized [auth/mail] warnings; the caught
      // rejection here only prevents an unhandled promise rejection and never
      // logs tokens, URLs, passwords, or secrets.
      void sendPasswordResetMail(
        user,
        appUrl,
        AUTH_TOKEN_EXPIRES_IN_MINUTES,
      ).catch(() => {
        // Failure was already diagnosed generically by src/lib/auth/mail.ts.
      });
    },
    // Reset tokens are DB-backed (the `verification` table), expire after this
    // window, and are consumed on first use (single-use).
    resetPasswordTokenExpiresIn: AUTH_TOKEN_EXPIRES_IN_SECONDS,
    // A successful password reset revokes every existing session for the user,
    // so a session that existed before the reset cannot outlive it (the reset
    // owner re-signs in afterwards).
    revokeSessionsOnPasswordReset: true,
  },
  // Email verification.
  //
  // Sign-in is NOT gated on verification (`requireEmailVerification` stays off):
  // forcing it would break existing local/password accounts and the team-invite
  // flow, which currently assume immediate sign-in. Verification is therefore a
  // self-service hardening feature: users can verify from their profile, from
  // the verify link, or on demand via `POST /api/auth/send-verification-email`.
  // Turn `requireEmailVerification: true` here (and remove the feature-flag
  // note below) once every pre-existing account can be verified.
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      await sendVerificationMail(user, url, AUTH_TOKEN_EXPIRES_IN_MINUTES);
    },
    // No automatic send on signup/signin: the app must not email every new or
    // returning visitor before they opt in. Verification emails are sent on
    // demand (profile/resend flow).
    sendOnSignUp: false,
    sendOnSignIn: false,
    expiresIn: AUTH_TOKEN_EXPIRES_IN_SECONDS,
  },
  socialProviders:
    googleEnabled && googleClientId && googleClientSecret
      ? {
          google: {
            clientId: googleClientId,
            clientSecret: googleClientSecret,
          },
        }
      : undefined,
  // Account linking: a Google account whose email matches an existing local
  // user is linked to it (Google is a trusted provider, so Google's own
  // email-verified flag satisfies the check — legacy local accounts that were
  // never email-verified can still be recovered this way). The local password
  // is untouched and email/password login keeps working afterwards. A brand-new
  // Google sign-in creates its own user with no password — those users are
  // never forced into a password unless they choose to add one later.
  account:
    googleEnabled
      ? {
          accountLinking: {
            trustedProviders: ["google"],
            updateUserInfoOnLink: true,
          },
        }
      : undefined,
  // Server-side email gate at the Better Auth boundary: sign-up and sign-in
  // reject malformed/unnormalized addresses before the endpoint handler runs,
  // so validation cannot be bypassed by calling the API directly. Only a
  // format rejection is returned here — credential/account errors are left to
  // Better Auth's own generic messages (account existence is never revealed).
  hooks: {
    before: async (ctx) => {
      const authCtx = ctx as {
        path?: string;
        params?: { token?: string };
        body?: { email?: unknown };
      };
      // Email reset links are always built against the APP page
      // (`/reset-password/<token>`), never against Better Auth's own server
      // callback route. Older links (sent while `redirectTo` was passed) point
      // at `/api/auth/reset-password/<token>`, whose server redirect drops the
      // user on the login/error page instead of the reset form — so any such
      // request is forwarded to the app page, where token validity is checked
      // on submit with a friendly BizLedger message. This does not consume or
      // weaken the token: it is merely a transfer to the same-time page.
      if (authCtx.path === "/reset-password/:token" && authCtx.params?.token) {
        const appUrl = `${process.env.BETTER_AUTH_URL}/reset-password/${encodeURIComponent(authCtx.params.token)}`;
        return { response: Response.redirect(appUrl, 302) };
      }
      // Password-reset hardening:
      //  1. Per-email reset budget (Fix 3) — enforced BEFORE the endpoint so
      //     known and unknown addresses are throttled identically (no account-
      //     existence signal), then
      //  2. older reset tokens for the same user are invalidated (Fix 2). The
      //     response stays the uniform "check your email" message; only an
      //     exhausted email budget returns the same generic 429 Better Auth
      //     itself uses for the per-IP limit.
      if (authCtx.path === "/request-password-reset") {
        const email = typeof authCtx.body?.email === "string" ? authCtx.body.email : "";
        if (email) {
          const budget = await consumeEmailResetBudget(email);
          if (!budget.allowed) {
            return {
              response: Response.json(
                { message: RESET_RATE_LIMIT_MESSAGE },
                {
                  status: 429,
                  headers: {
                    "X-Retry-After": String(
                      budget.retryAfterSeconds ?? EMAIL_RESET_MAX_PER_WINDOW,
                    ),
                  },
                },
              ),
            };
          }
          await invalidatePriorResetTokens(email);
        }
      }
      if (authCtx.path === "/sign-up/email" || authCtx.path === "/sign-in/email") {
        const email = typeof authCtx.body?.email === "string" ? authCtx.body.email : "";
        if (!isValidEmail(email)) {
          return {
            response: Response.json(
              { message: EMAIL_INVALID_MESSAGE },
              { status: 400 },
            ),
          };
        }
      }
    },
  },
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  advanced: {
    // Secure/session cookies only in production builds over HTTPS.
    useSecureCookies,
    // Client-IP resolution for rate limiting: production trusts forwarded
    // `X-Forwarded-For` only when TRUSTED_PROXIES names the real reverse
    // proxies; without it production refuses forwarded headers entirely
    // (shared per-path bucket — never a spoofable per-IP bypass). See
    // src/lib/auth/trust-config.ts and DEPLOYMENT.md §6.1.
    ipAddress: resolveIpAddressConfig(
      process.env.NODE_ENV ?? "development",
      process.env.TRUSTED_PROXIES,
    ),
  },
  // Rate limiting for the auth endpoints. Storage is the shared PostgreSQL
  // `rate_limit` table so the limit holds across every server instance (the
  // default "memory" store is process-local and would not). Enabled in
  // production by default, matching Better Auth's posture, and can be forced
  // on in any environment with AUTH_RATE_LIMIT_FORCE=true (documented in
  // .env.example; used by the throttling test suite and staging soak tests).
  // Paths are the normalized auth paths (base URL stripped).
  rateLimit: {
    enabled: process.env.NODE_ENV === "production" || process.env.AUTH_RATE_LIMIT_FORCE === "true",
    window: 60,
    max: 100,
    storage: "database",
    customRules: {
      "/sign-in/email": { window: 60, max: 10 },
      "/sign-up/email": { window: 3600, max: 20 },
      "/forget-password/email": { window: 300, max: 5 },
      "/request-password-reset": { window: 300, max: 5 },
      "/reset-password": { window: 300, max: 10 },
      "/send-verification-email": { window: 300, max: 5 },
      "/verify-email": { window: 300, max: 20 },
      "/change-password": { window: 300, max: 10 },
      "/change-email": { window: 300, max: 10 },
    },
  },
  trustedOrigins: isLocalDev() ? ["http://localhost:3001", "http://127.0.0.1:3001"] : parseTrustedOrigins(process.env.TRUSTED_ORIGINS),
});

/**
 * Local-development cross-origin allowlist for the standalone admin console
 * (`bizledger-admin` on :3001), which proxies /api/* to this backend. Only
 * enabled while the backend runs on localhost so production stays locked down
 * to its own origin; production admin origins are configured separately.
 */
function isLocalDev(): boolean {
  const base = process.env.BETTER_AUTH_URL ?? "";
  return base.startsWith("http://localhost") || base.startsWith("http://127.0.0.1");
}

// One-time operational warning for a production deploy that has not declared
// its reverse proxies: per-IP rate limiting silently degrades to the shared
// bucket. Skipped during `next build` (NEXT_PHASE is set) so build logs stay
// clean. No sensitive value is involved.
if (
  process.env.NODE_ENV === "production" &&
  !process.env.TRUSTED_PROXIES &&
  process.env.NEXT_PHASE !== "phase-production-build"
) {
  console.warn(
    "[auth/ip] TRUSTED_PROXIES is not set: X-Forwarded-For is NOT trusted; " +
      "IP rate limiting falls back to a single shared per-path bucket. " +
      "Set TRUSTED_PROXIES to your reverse-proxy IPs/CIDRs (DEPLOYMENT.md §6.1).",
  );
}