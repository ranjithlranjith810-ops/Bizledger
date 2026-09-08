"use client";

import Link from "next/link";
import { LEGAL_LINKS, LEGAL } from "@/config/legal";

export function AppLegalFooter() {
  return (
    <div className="mt-8 border-t border-outline-variant/30 pt-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:hidden">
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
      <div className="flex flex-col gap-1 text-[11px] text-outline">
        <p>
          {new Date().getFullYear()} BizLedger · Frontend demo · {LEGAL.contactEmail}
        </p>
        <p className="text-outline/70">Powered by Ghost Cube</p>
      </div>
    </div>
  );
}