// Prisma client singleton for the server layer.
//
// Prisma 7 uses a driver-adapter based client: a PostgreSQL driver adapter
// (`@prisma/adapter-pg`) is required at runtime. `DATABASE_URL` holds the
// runtime Pooler (Supabase's pooled pgbouncer) connection string.
//
// This file is SERVER-ONLY. Never import it into client components.
//
// The globalThis caching prevents Next.js hot-reload from creating a new
// PrismaClient on every module re-evaluation in development, while production
// creates exactly one instance.

import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function createClient(): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.DATABASE_URL as string,
    }),
  });
}

export const prisma: PrismaClient =
  globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}