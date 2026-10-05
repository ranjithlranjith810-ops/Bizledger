"use client";

import Link from "next/link";
import { BizLedgerLogo } from "@/components/shared/BizLedgerLogo";
import { LEGAL, LEGAL_LINKS } from "@/config/legal";

export function LegalFooter({ variant = "default" }: { variant?: "default" | "compact" }) {
  const entityLabel =
    LEGAL.entityName === "[LEGAL ENTITY NAME]" ? "BizLedger" : LEGAL.entityName;

  // Compact variant: identical links and legal text, laid out as a slim
  // centred column instead of a full-width band. A focused auth screen has no
  // room for the band — it pushes the form off the viewport's centre axis and
  // leaves a void under the card. Opt-in only; every other page keeps the
  // default band below.
  //
  // Deliberately NO border rule and a small 16px gap: a horizontal rule here
  // sat far below the viewport centre and read as a hard edge that cut the
  // login composition into two separate blocks. Sharing the composition's 16px
  // rhythm (and its muted type) keeps the legal links attached to the card
  // instead of competing with it.
  if (variant === "compact") {
    return (
      <footer className="mt-4 text-center">
        <nav className="mx-auto flex max-w-md flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
          {LEGAL_LINKS.map((l) => (
            <Link
              key={l.slug}
              href={l.href}
              className="text-[11px] text-outline transition-colors hover:text-on-surface"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <p className="mt-3 text-[11px] leading-relaxed text-outline">
          &copy; {new Date().getFullYear()} {entityLabel}. All rights reserved.
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-outline">
          Contact: {LEGAL.contactEmail}
        </p>
      </footer>
    );
  }

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
            &copy; {new Date().getFullYear()} {entityLabel}. All rights reserved.
          </p>
          <p className="text-[11px] text-outline text-center">
            Contact: {LEGAL.contactEmail}
          </p>
        </div>
      </div>
    </footer>
  );
}
