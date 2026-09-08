"use client";

import { http } from "@/lib/api-client";
import type { NotificationItem } from "@/types";

export interface NotificationBackendJson {
  id: string;
  userId: string;
  businessId: string | null;
  type: string;
  title: string;
  message: string | null;
  isRead: boolean;
  readAt: string | null;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
}

const TYPE_ICONS: Record<string, string> = {
  payment: "payments",
  warning: "warning",
  payroll: "payroll",
  renewal: "event_repeat",
  info: "info",
  success: "check_circle",
  error: "error",
};

/** Backend NotificationJson -> frontend NotificationItem. */
export function fromBackendNotification(n: NotificationBackendJson): NotificationItem {
  return {
    id: n.id,
    type: (n.type as NotificationItem["type"]) ?? "info",
    title: n.title,
    message: n.message ?? "",
    timeAgo: "",
    read: n.isRead,
    icon: TYPE_ICONS[n.type] ?? "info",
  };
}

export const notificationsApi = {
  list: (opts?: { businessId?: string; unread?: boolean }) => {
    const params = new URLSearchParams();
    if (opts?.businessId) params.set("businessId", opts.businessId);
    if (opts?.unread) params.set("unread", "true");
    const qs = params.toString();
    return http.get<{ notifications: NotificationBackendJson[] }>(
      qs ? `/api/notifications?${qs}` : "/api/notifications",
    );
  },
  markRead: (id: string) =>
    http.patch<{ notification: NotificationBackendJson }>(`/api/notifications/${id}/read`, {}),
  markAllRead: (businessId?: string) =>
    http.post<{ count: number }>(
      "/api/notifications/read-all",
      {},
      businessId ? { businessId } : {},
    ),
  dismiss: (id: string) =>
    http.del<{ id: string }>(`/api/notifications/${id}`),
};