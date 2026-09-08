import { NextRequest, NextResponse } from "next/server";
import { listNotifications } from "@/lib/notification/notification-service";
import { handleApiError } from "@/lib/business/api-error";

// GET /api/notifications?businessId=...&unread=true — the caller's own
// notifications (optional business scope + unread filter).
export async function GET(request: NextRequest) {
  try {
    const opts = {
      businessId: request.nextUrl.searchParams.get("businessId") ?? undefined,
      unread: request.nextUrl.searchParams.get("unread") === "true",
    };
    const notifications = await listNotifications(opts);
    return NextResponse.json({ notifications });
  } catch (error) {
    return handleApiError(error);
  }
}