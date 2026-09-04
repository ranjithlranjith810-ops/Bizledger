// Better Auth server configuration.
//
// - Uses the Prisma adapter backed by PostgreSQL.
// - Enables email/password authentication only.
// - No social (OAuth) providers are configured because no OAuth credentials
//   exist in the environment — this is intentionally server-side only.
//
// The Better Auth `User` is a person/account identity and is deliberately kept
// distinct from the future `Business` tenant (multi-tenant architecture). This
// foundation does not constrain that separation.

import { betterAuth } from "better-auth";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
  },
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
});