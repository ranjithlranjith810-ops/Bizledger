import { NextRequest, NextResponse } from "next/server";
import { markNotificationRead } from "@/lib/notification/notification-service";
import { handleApiError } from "@/lib/business/api-error";

// PATCH /api/notifications/[id]/read — mark one of the caller's notifications
// as read. Idempotent for already-read notifications.
export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const notification = await markNotificationRead(id);
    return NextResponse.json({ notification });
  } catch (error) {
    return handleApiError(error);
  }
}