// Server-side Notification service layer.
//
// Notifications are PRIVATE and owned by the authenticated user (`userId`).
// The owner is ALWAYS resolved from the session (requireUser) — never from the
// request body — so a caller can only ever read/mutate their own rows.
// `businessId` is an OPTIONAL business scope (platform-level notices may have
// none) and is used only as a read filter, never as an ownership signal.
//
// An id at any endpoint that does not belong to the caller resolves to a 404,
// identical to a nonexistent id (no cross-user disclosure).
//
// `type` mirrors the frontend NotificationItem.type allowlist.

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/business/tenant";
import {
  ValidationError,
  ResourceNotFoundError,
} from "@/lib/business/api-error";

export const NOTIFICATION_TYPES = [
  "payment",
  "warning",
  "payroll",
  "renewal",
  "info",
  "success",
  "error",
] as const;

const ID_LIMIT = 64;

function str(v: unknown): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s === "" ? undefined : s;
}

function validateId(id: unknown): string {
  const v = str(id);
  if (!v) throw new ValidationError("Missing notification id");
  if (v.length > ID_LIMIT) throw new ValidationError("Invalid notification id");
  return v;
}

function toNotificationJson(n: {
  id: string;
  userId: string;
  businessId: string | null;
  type: string;
  title: string;
  message: string | null;
  isRead: boolean;
  readAt: Date | null;
  entityType: string | null;
  entityId: string | null;
  createdAt: Date;
}) {
  return {
    id: n.id,
    userId: n.userId,
    businessId: n.businessId,
    type: n.type,
    title: n.title,
    message: n.message,
    isRead: n.isRead,
    readAt: n.readAt ? n.readAt.toISOString() : null,
    entityType: n.entityType,
    entityId: n.entityId,
    createdAt: n.createdAt.toISOString(),
  };
}

export interface CreateNotificationInput {
  userId: string;
  businessId?: string;
  type: string;
  title: string;
  message?: string;
  entityType?: string;
  entityId?: string;
}

/**
 * Service-layer factory used by internal modules to notify a specific user
 * (e.g. a system-initiated notice). Validates the fixed type allowlist and
 * length caps. Does NOT touch the auth/session layer — the caller already has
 * a resolved userId.
 */
export async function createNotification(input: CreateNotificationInput) {
  const type = str(input.type);
  if (!type || !(NOTIFICATION_TYPES as readonly string[]).includes(type)) {
    throw new ValidationError("Invalid notification type");
  }

  const title = str(input.title);
  if (!title) throw new ValidationError("Notification title is required");
  if (title.length > 120) throw new ValidationError("Notification title is too long");

  const message = input.message === undefined || input.message === null
    ? undefined
    : String(input.message).trim();
  if (message !== undefined && message.length > 1000) {
    throw new ValidationError("Notification message is too long");
  }

  const businessId = input.businessId ? String(input.businessId).trim() : undefined;
  if (businessId && businessId.length > ID_LIMIT) {
    throw new ValidationError("businessId is invalid");
  }

  const entityType = str(input.entityType);
  if (entityType !== undefined && entityType.length > 50) {
    throw new ValidationError("entityType is invalid");
  }
  const entityId = str(input.entityId);
  if (entityId !== undefined && entityId.length > ID_LIMIT) {
    throw new ValidationError("entityId is invalid");
  }

  const created = await prisma.notification.create({
    data: {
      userId: input.userId,
      businessId: businessId ?? null,
      type,
      title,
      message: message ?? null,
      entityType: entityType ?? null,
      entityId: entityId ?? null,
    },
  });
  return toNotificationJson(created);
}

/**
 * GET /api/notifications — the caller's own notifications, newest first.
 * Optional `businessId` restricts to a business scope; `unread=true` filters.
 */
export async function listNotifications(
  opts: { businessId?: string; unread?: boolean },
) {
  const { user } = await requireUser();

  const where: { userId: string; businessId?: string; isRead?: boolean } = {
    userId: user.id,
  };
  const businessId = str(opts?.businessId);
  if (businessId) where.businessId = businessId;
  if (opts?.unread === true) where.isRead = false;

  const rows = await prisma.notification.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 100,
  });

  return rows.map(toNotificationJson);
}

/**
 * PATCH /api/notifications/[id]/read — mark one of the caller's notifications
 * read. Idempotent: already-read notifications stay read. Foreign/nonexistent
 * ids are a 404 (no disclosure).
 */
export async function markNotificationRead(idInput: unknown) {
  const { user } = await requireUser();
  const id = validateId(idInput);

  const existing = await prisma.notification.findFirst({
    where: { id, userId: user.id },
  });
  if (!existing) throw new ResourceNotFoundError("Notification not found");

  const updated = await prisma.notification.update({
    where: { id },
    data: { isRead: true, readAt: existing.isRead ? existing.readAt : new Date() },
  });
  return toNotificationJson(updated);
}

/**
 * POST /api/notifications/read-all — mark every unread notification of the
 * caller read (optionally business-scoped). Returns the number affected.
 */
export async function markAllNotificationsRead(opts: { businessId?: string }) {
  const { user } = await requireUser();

  const where: { userId: string; businessId?: string; isRead: boolean } = {
    userId: user.id,
    isRead: false,
  };
  const businessId = str(opts?.businessId);
  if (businessId) where.businessId = businessId;

  const result = await prisma.notification.updateMany({
    where,
    data: { isRead: true, readAt: new Date() },
  });

  return { count: result.count };
}

/**
 * DELETE /api/notifications/[id] — dismiss one of the caller's notifications.
 */
export async function deleteNotification(idInput: unknown) {
  const { user } = await requireUser();
  const id = validateId(idInput);

  const existing = await prisma.notification.findFirst({
    where: { id, userId: user.id },
  });
  if (!existing) throw new ResourceNotFoundError("Notification not found");

  await prisma.notification.delete({ where: { id } });
  return { id };
}