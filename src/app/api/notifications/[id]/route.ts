import { NextRequest, NextResponse } from "next/server";
import { deleteNotification } from "@/lib/notification/notification-service";
import { handleApiError } from "@/lib/business/api-error";

// DELETE /api/notifications/[id] — dismiss one of the caller's notifications.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const result = await deleteNotification(id);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}