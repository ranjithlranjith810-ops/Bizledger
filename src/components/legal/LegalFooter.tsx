"use client";

import Link from "next/link";
import { BizLedgerLogo } from "@/components/shared/BizLedgerLogo";
import { LEGAL, LEGAL_LINKS } from "@/config/legal";

export function LegalFooter() {
  return (
    <footer className="border-t border-outline-variant/50 py-10">
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <BizLedgerLogo size="compact" />
            <span className="text-sm font-bold tracking-tight">BizLedger</span>
          </div>
          <nav className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {LEGAL_LINKS.map((l) => (
              <Link
                key={l.slug}
                href={l.href}
                className="text-xs text-outline hover:text-on-surface transition-colors"
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="mt-8 pt-6 border-t border-outline-variant/30 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-[11px] text-outline">
            &copy; {new Date().getFullYear()} {LEGAL.entityName === "[LEGAL ENTITY NAME]" ? "BizLedger" : LEGAL.entityName}. All rights reserved.
          </p>
          <p className="text-[11px] text-outline text-center">
            Frontend demo build — your data is stored locally in this browser.
            Contact: {LEGAL.contactEmail}
          </p>
        </div>
      </div>
    </footer>
  );
}