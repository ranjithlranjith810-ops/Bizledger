"use client";

import Link from "next/link";
import { LEGAL_LINKS, LEGAL } from "@/config/legal";

export function AppLegalFooter() {
  return (
    <div className="mt-8 border-t border-outline-variant/30 pt-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <nav className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {LEGAL_LINKS.map((l) => (
          <Link
            key={l.slug}
            href={l.href}
            className="text-[11px] text-outline hover:text-on-surface transition-colors"
          >
            {l.label}
          </Link>
        ))}
      </nav>
      <p className="text-[11px] text-outline">
        {new Date().getFullYear()} BizLedger · Frontend demo · {LEGAL.contactEmail}
      </p>
    </div>
  );
}