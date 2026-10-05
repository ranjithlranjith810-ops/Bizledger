// Server-side authenticated-identity context for the tenancy layer.
//
// This is the single place that resolves a request's session into an
// authenticated `User` using Better Auth. It is intentionally thin: it only
// resolves WHO the user is. Business/membership/authorization resolution lives
// in the business service layer, which is built on top of this.
//
// SECURITY: No request-supplied identity is ever trusted here. The session is
// validated from the Better Auth cookie cache against the persistent session
// store before a request is treated as authenticated.

import { cookies, headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { User } from "@/generated/prisma/client";

export interface AuthContext {
  user: User;
}

/**
 * Resolves the current authenticated user from the request's Better Auth
 * session. Returns `null` when the request is not authenticated.
 *
 * Never leaks session/secret data; returns only the resolved user or null.
 */
export async function getCurrentUser(): Promise<AuthContext | null> {
  // The request's RAW cookie header is not guaranteed to surface through
  // `headers()` on every Next.js build (this version surfaces only a forwarded
  // header subset). Always forward the session cookie explicitly from the
  // `cookies()` store so Better Auth can validate the session server-side.
  const nextHeaders = await headers();
  const forwardedHeaders = new Headers();
  nextHeaders.forEach((value, key) => forwardedHeaders.set(key, value));
  const requestCookies = await cookies();
  const cookiePairs: string[] = [];
  for (const entry of requestCookies.getAll()) {
    cookiePairs.push(`${entry.name}=${entry.value}`);
  }
  if (cookiePairs.length > 0) {
    forwardedHeaders.set("cookie", cookiePairs.join("; "));
  }

  const session = await auth.api.getSession({
    headers: forwardedHeaders,
  });

  if (!session?.user) {
    return null;
  }

  return { user: session.user as User };
}

/**
 * Throws when the request is not authenticated. Use this in protected
 * server routes and services that must fail closed on unauthenticated access.
 * Returns the resolved user when authenticated.
 *
 * AUTHORITATIVE STATUS: the user is re-read from the DB on every call instead
 * of trusting the session snapshot. Better Auth may serve a cached/cookie-cached
 * `session.user` captured at sign-in, so suspension is enforced against the
 * live `User.status` row (the DB is the authority, per Phase 9B) — a suspended
 * user is cut off on their NEXT protected request, even with a still-valid
 * session and cached cookie.
 *
 * By default a suspended user is rejected with a 403-class `SuspendedUserError`
 * so that suspension immediately revokes access to every protected customer
 * API. `ignoreSuspension` is used ONLY by platform-administrator resolution
 * (`requirePlatformAdminRole`), which needs the freshly-read user row so it can
 * refuse a suspended administrator with its own administrator-specific error —
 * it performs that check itself, one statement later, and does not skip it.
 */
export async function requireUser(
  options: { ignoreSuspension?: boolean } = {}
): Promise<AuthContext> {
  const ctx = await getCurrentUser();
  if (!ctx) {
    throw new UnauthorizedError("Authentication required");
  }
  const fresh = await prisma.user.findUnique({ where: { id: ctx.user.id } });
  if (!fresh) {
    throw new UnauthorizedError("Authentication required");
  }
  const user = fresh as User;
  if (!options.ignoreSuspension && user.status === "SUSPENDED") {
    throw new SuspendedUserError();
  }
  return { user };
}

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class SuspendedUserError extends Error {
  constructor(message = "Your account has been suspended") {
    super(message);
    this.name = "SuspendedUserError";
  }
}
