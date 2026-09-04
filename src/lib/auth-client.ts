// Better Auth React client (client-side).
//
// This is a React + Next.js application, so we use the official React client
// from `better-auth/react`. It is intended for use in client components and
// talks to the Better Auth API route (`/api/auth/*`) served by this app.
//
// No secret values are referenced here. The client defaults to the current
// origin, so same-origin deployments need no baseURL override.

import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: typeof window !== "undefined" ? window.location.origin : undefined,
});