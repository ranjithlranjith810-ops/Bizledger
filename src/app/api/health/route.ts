// GET /api/health — minimal liveness + database health probe.
//
// Output is deliberately sanitized for external monitoring: it contains only a
// coarse status, a fixed service name, and a per-check up/down flag. It never
// includes connection strings, URLs, schema fragments, stack traces, or any
// environment secret.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const SERVICE_NAME = "bizledger-api";
const DB_PROBE_TIMEOUT_MS = 3000;

export async function GET() {
  let databaseUp = false;
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("database probe timed out")),
          DB_PROBE_TIMEOUT_MS,
        ),
      ),
    ]);
    databaseUp = true;
  } catch {
    databaseUp = false;
  }

  const ok = databaseUp;
  return NextResponse.json(
    {
      status: ok ? "ok" : "degraded",
      service: SERVICE_NAME,
      checks: {
        database: databaseUp ? "up" : "down",
      },
    },
    { status: ok ? 200 : 503 },
  );
}