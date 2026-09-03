"use client";

import React from "react";
import { usePathname, useRouter } from "next/navigation";
import { navigationSections } from "@/lib/constants";
import { BizLedgerLogo } from "@/components/shared/BizLedgerLogo";

export interface SideNavBarProps {
  collapsed?: boolean;
}

export const SideNavBar: React.FC<SideNavBarProps> = ({
  collapsed = false,
}) => {
  const pathname = usePathname();
  const router = useRouter();
  const currentPath = pathname;

  const handleNavigate = (path: string) => {
    router.push(path);
  };

  return (
    <aside
      id="side-nav-bar"
      className={`bg-surface-container-lowest border-r border-outline-variant/30 flex flex-col h-screen select-none transition-all duration-200 z-30 shrink-0 ${
        collapsed ? 'w-20' : 'w-[260px]'
      } hidden lg:flex`}
    >
      {/* Brand Header */}
      <div id="sidebar-brand-header" className="h-16 flex items-center px-5 gap-3 border-b border-outline-variant/20">
        {collapsed ? (
          <div className="w-full flex justify-center">
            <BizLedgerLogo size="compact" />
          </div>
        ) : (
          <>
            <BizLedgerLogo size="default" />
            <div className="flex flex-col min-w-0">
              <span className="font-bold text-base tracking-tight text-on-surface leading-none">BizLedger</span>
              <span className="text-[10px] font-semibold tracking-wider text-outline uppercase mt-1">Premium Billing Suite</span>
            </div>
          </>
        )}
      </div>

      {/* Navigation Links Scrollable Area */}
      <div id="sidebar-navigation-items" className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {navigationSections.map((section, idx) => (
          <div key={idx} className="space-y-1">
            {!collapsed && section.title && (
              <div className="px-3 text-[11px] font-bold tracking-wider text-outline uppercase mb-2">
                {section.title}
              </div>
            )}
            {section.items.map((item) => {
              const isActive =
                currentPath === item.href ||
                currentPath.startsWith(item.href + "/") ||
                (item.href === "/dashboard" && currentPath === "/");
              return (
                <button
                  key={item.href}
                  id={`nav-item-${item.href.replace(/[^a-zA-Z0-9]/g, '-')}`}
                  onClick={() => handleNavigate(item.href)}
                  title={collapsed ? item.label : undefined}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-active-nav-bg text-primary font-semibold'
                      : 'text-secondary hover:bg-surface-container-low hover:text-on-surface'
                  } ${collapsed ? 'justify-center px-0' : ''}`}
                >
                  <span
                    className={`material-symbols-outlined text-[20px] shrink-0 ${
                      isActive ? 'text-primary fill' : 'text-secondary'
                    }`}
                  >
                    {item.icon}
                  </span>
                  {!collapsed && (
                    <span className="truncate flex-1 text-left">{item.label}</span>
                  )}
                  {!collapsed && item.badge && (
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                        isActive
                          ? 'bg-primary text-on-primary'
                          : 'bg-surface-container-high text-secondary'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* User Profile Footer */}
      <div id="sidebar-user-footer" className="p-3 border-t border-outline-variant/20 bg-surface-container-lowest">
        <div className={`flex items-center gap-3 p-2 rounded-lg hover:bg-surface-container-low transition-colors cursor-pointer ${collapsed ? 'justify-center' : ''}`}>
          <div className="w-8 h-8 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center font-semibold text-xs shrink-0">
            AM
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-on-surface truncate">Alex Mercer</p>
              <p className="text-[10px] text-outline truncate">Account Admin</p>
            </div>
          )}
          {!collapsed && (
            <span className="material-symbols-outlined text-outline text-[18px]">unfold_more</span>
          )}
        </div>
      </div>
    </aside>
  );
};