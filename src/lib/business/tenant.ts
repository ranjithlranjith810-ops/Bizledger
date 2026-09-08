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

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
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
  const session = await auth.api.getSession({
    headers: await headers(),
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
 */
export async function requireUser(): Promise<AuthContext> {
  const ctx = await getCurrentUser();
  if (!ctx) {
    throw new UnauthorizedError("Authentication required");
  }
  return ctx;
}

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}
