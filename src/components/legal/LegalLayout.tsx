"use client";

import Link from "next/link";
import { BizLedgerLogo } from "@/components/shared/BizLedgerLogo";
import { LegalFooter } from "@/components/legal/LegalFooter";
import { LEGAL_PLACEHOLDER, legalDoc } from "@/config/legal";

interface LegalSection {
  heading?: string;
  body?: string;
  items?: string[];
  table?: { rows: { label: string; value: string }[] };
}

interface LegalLayoutProps {
  slug: string;
  children?: React.ReactNode;
  sections?: LegalSection[];
}

function Section({ s }: { s: LegalSection }) {
  return (
    <section className="space-y-2">
      {s.heading && (
        <h2 className="text-sm font-bold tracking-tight text-on-surface">{s.heading}</h2>
      )}
      {s.body && <p className="text-xs leading-relaxed text-outline">{s.body}</p>}
      {s.items && (
        <ul className="list-disc pl-5 space-y-1.5 text-xs leading-relaxed text-outline">
          {s.items.map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </ul>
      )}
      {s.table && (
        <div className="overflow-x-auto rounded-lg border border-outline-variant/50">
          <table className="w-full text-left text-xs">
            <tbody className="divide-y divide-outline-variant/40">
              {s.table.rows.map((r, i) => (
                <tr key={i} className="align-top">
                  <td className="py-2 px-3 font-semibold text-secondary w-[200px]">{r.label}</td>
                  <td className="py-2 px-3 text-on-surface">{r.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function LegalLayout({ slug, children, sections }: LegalLayoutProps) {
  const doc = legalDoc(slug);

  return (
    <div className="min-h-screen bg-background text-on-surface flex flex-col">
      <header className="border-b border-outline-variant/50">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <BizLedgerLogo size="default" />
            <span className="text-lg font-bold tracking-tight">BizLedger</span>
          </Link>
          <nav className="flex items-center gap-2">
            <Link href="/login" className="text-xs font-semibold text-secondary hover:text-on-surface transition-colors">
              Log in
            </Link>
            <Link
              href="/signup"
              className="px-3 py-1.5 rounded-lg bg-[#93000b] hover:bg-[#770008] text-white text-xs font-bold transition-colors"
            >
              Create Account
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
          <div className="mb-8">
            {doc && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-outline-variant/60 bg-surface-container-lowest px-3 py-1 text-[11px] font-semibold text-secondary">
                Version {doc.version} · Effective {doc.effectiveDate}
              </span>
            )}
            <h1 className="mt-4 text-2xl font-extrabold tracking-tight">{doc?.title}</h1>
            {doc?.summary && (
              <p className="mt-2 text-sm text-outline max-w-2xl">{doc.summary}</p>
            )}
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[11px] leading-relaxed text-amber-800">
              BizLedger is a frontend demo build. Your data is stored locally in
              this browser ({LEGAL_PLACEHOLDER} is a placeholder). This document
              describes intended policy and does not create a binding legal
              relationship yet.
            </div>
          </div>

          <div className="space-y-6">
            {sections?.map((s, i) => <Section key={i} s={s} />)}
            {children}
          </div>
        </div>
      </main>

      <LegalFooter />
    </div>
  );
}