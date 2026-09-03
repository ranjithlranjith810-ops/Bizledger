"use client";

import React from "react";
import { usePathname, useRouter } from "next/navigation";
import { ROUTES } from "@/lib/constants";

interface MobileNavItem {
  label: string;
  route: string;
  icon: string;
  extraActivePrefix?: string;
}

const NAV_ITEMS: MobileNavItem[] = [
  { label: "Home", route: ROUTES.dashboard, icon: "home" },
  { label: "Customers", route: ROUTES.customers, icon: "group" },
  { label: "Products", route: ROUTES.products, icon: "inventory_2" },
  { label: "Quotes", route: ROUTES.quotations, icon: "request_quote" },
  { label: "Estimates", route: ROUTES.estimates, icon: "insights" },
  { label: "Purchases", route: ROUTES.purchaseOrders, icon: "shopping_cart" },
  { label: "Reports", route: ROUTES.reports, icon: "assessment" },
  { label: "Settings", route: ROUTES.settings, icon: "settings", extraActivePrefix: "/pricing" },
];

export const MobileNav: React.FC = () => {
  const pathname = usePathname();
  const router = useRouter();
  const currentRoute = pathname;

  const isActive = (item: MobileNavItem) => {
    const matches =
      currentRoute === item.route ||
      currentRoute.startsWith(item.route + "/") ||
      (item.route === ROUTES.dashboard && currentRoute === "/");
    if (!matches && item.extraActivePrefix) {
      return currentRoute.startsWith(item.extraActivePrefix);
    }
    return matches;
  };

  return (
    <nav className="fixed bottom-0 left-0 w-full z-50 lg:hidden bg-surface-container-lowest border-t border-outline-variant shadow-lg flex justify-around items-center h-16 px-1 select-none">
      {NAV_ITEMS.map((item) => {
        const active = isActive(item);
        return (
          <button
            key={item.route}
            onClick={() => router.push(item.route)}
            className={`flex flex-col items-center justify-center px-0.5 py-xs scale-95 transition-all duration-150 rounded-xl ${
              active
                ? "bg-active-nav-bg text-primary font-bold"
                : "text-on-surface-variant active:bg-surface-container"
            }`}
          >
            <span
              className="material-symbols-outlined text-[22px]"
              style={active ? { fontVariationSettings: "'FILL' 1" } : undefined}
            >
              {item.icon}
            </span>
            <span className="font-label-sm text-[9px] mt-xs whitespace-nowrap">
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
};