import { NextRequest, NextResponse } from "next/server";
import { markAllNotificationsRead } from "@/lib/notification/notification-service";
import { handleApiError } from "@/lib/business/api-error";

// POST /api/notifications/read-all?businessId=... — mark all of the caller's
// notifications read (optionally business-scoped). Idempotent.
export async function POST(request: NextRequest) {
  try {
    const opts = {
      businessId: request.nextUrl.searchParams.get("businessId") ?? undefined,
    };
    const result = await markAllNotificationsRead(opts);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}