"use client";

import React from "react";
import { useApp } from "@/context/AppContext";

export const NotificationDrawer: React.FC = () => {
  const {
    isNotificationOpen,
    setIsNotificationOpen,
    notifications,
    markAllNotificationsRead,
    markNotificationRead,
  } = useApp();

  if (!isNotificationOpen) return null;

  // Unread-only view. Opening the drawer never auto-marks anything as read; a
  // notification leaves this list only when its "Mark as Read" action is
  // explicitly invoked (or all are marked).
  const unreadNotifications = notifications.filter((n) => !n.read);

  return (
    <>
      {/* Semi-transparent overlay backdrop */}
      <div
        onClick={() => setIsNotificationOpen(false)}
        className="fixed inset-0 bg-on-background/30 backdrop-blur-xs z-50 transition-opacity animate-[fadeIn_0.15s_ease-out]"
      />

      {/* Notification Drawer sliding in from right */}
      <div className="fixed top-0 right-0 h-full w-full sm:w-[400px] bg-surface-container-lowest shadow-2xl z-50 flex flex-col border-l border-outline-variant transform transition-transform duration-200 ease-out">
        {/* Drawer Header */}
        <div className="flex items-center justify-between p-md border-b border-outline-variant bg-surface-container-lowest shrink-0 h-16">
          <h2 className="font-headline-md text-headline-md text-on-background font-semibold">Notifications</h2>
          <div className="flex items-center gap-sm">
            <button
              onClick={markAllNotificationsRead}
              className="text-primary font-label-md hover:bg-active-nav-bg px-2 py-1 rounded transition-colors text-xs font-semibold"
            >
              Mark All as Read
            </button>
            <button
              onClick={() => setIsNotificationOpen(false)}
              className="p-1 text-on-surface-variant hover:bg-surface-container rounded-full transition-colors flex items-center justify-center"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
        </div>

        {/* Notification List (unread only) */}
        <div className="flex-1 overflow-y-auto bg-surface-bright">
          <div className="flex flex-col">
            {unreadNotifications.map((item) => (
              <div
                key={item.id}
                className="group flex items-start gap-md p-md border-b border-outline-variant/50 relative"
              >
                {/* Unread Indicator */}
                <div className="absolute left-2 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-primary" />

                {/* Icon */}
                <div className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center shrink-0 border border-outline-variant ml-2 group-hover:border-primary transition-colors">
                  <span className={`material-symbols-outlined text-[20px] ${item.iconColor || 'text-primary'}`}>
                    {item.icon}
                  </span>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className="font-label-md text-on-background mb-1 text-xs font-semibold">{item.title}</p>
                  <p className="font-body-sm text-on-surface-variant line-clamp-2 text-xs leading-relaxed">
                    {item.message}
                  </p>
                  <div className="flex items-center justify-between mt-2">
                    <p className="font-label-sm text-on-surface-variant/70 text-[11px]">{item.timeAgo}</p>
                    <button
                      onClick={() => markNotificationRead(item.id)}
                      className="text-[11px] text-primary font-semibold hover:bg-surface-container px-2 py-0.5 rounded transition-colors"
                    >
                      Mark as Read
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {unreadNotifications.length === 0 && (
              <div className="p-md text-center mt-6 mb-4">
                <span className="material-symbols-outlined text-surface-dim text-4xl mb-2">done_all</span>
                <p className="font-body-sm text-on-surface-variant text-xs">You&apos;re all caught up — no unread notifications.</p>
              </div>
            )}
          </div>
        </div>

        {/* Drawer Footer */}
        <div className="p-md border-t border-outline-variant bg-surface-container-lowest shrink-0">
          <button
            onClick={() => setIsNotificationOpen(false)}
            className="w-full py-2 bg-surface text-primary border border-outline-variant rounded font-label-md hover:bg-surface-container transition-colors flex items-center justify-center text-xs font-semibold shadow-xs"
          >
            View All Notifications
          </button>
        </div>
      </div>
    </>
  );
};