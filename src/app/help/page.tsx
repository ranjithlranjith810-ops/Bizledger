"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { DocumentExperienceModal } from "@/components/documents/DocumentExperienceModal";
import { BizLedgerLogo } from "@/components/shared/BizLedgerLogo";
import { allDocumentHelpGuides, DocumentHelpGuide } from "@/lib/help-content";
import { DocumentKind, documentKindLabel } from "@/lib/document-experience";
import { Icon } from "../../components/ui/Icon";
import {
  ArrowRight,
  Check,
  CircleHelp,
  FileText,
  Lock,
  Pencil,
  Printer,
  ShieldAlert,
} from "lucide-react";

/** A single expandable help block. */
function Section({
  title,
  icon,
  children,
  tone = "plain",
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  tone?: "plain" | "locked" | "edit" | "warn";
}) {
  const toneStyles = {
    plain: "text-[#191c1e]",
    locked: "text-[#93000b]",
    edit: "text-[#0057c8]",
    warn: "text-[#8a5000]",
  }[tone];
  return (
    <div className="rounded-xl border border-[#eceef0] bg-white overflow-hidden">
      <div
        className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold ${toneStyles}`}
      >
        {icon}
        {title}
      </div>
      <div className="px-4 pb-4 pt-0.5 text-xs text-gray-600 leading-relaxed">
        {children}
      </div>
    </div>
  );
}

function Bullets({ items, marker }: { items: string[]; marker?: string }) {
  return (
    <ul className="space-y-1.5">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2">
          <span className="mt-[3px] shrink-0 text-gray-400" aria-hidden="true">
            {marker ?? "\u2022"}
          </span>
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

function Steps({ items }: { items: string[] }) {
  return (
    <ol className="space-y-2">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2.5">
          <span
            className="shrink-0 w-5 h-5 rounded-full bg-[#eef6ff] text-[#0057c8] text-[10px] font-bold flex items-center justify-center mt-[1px]"
            aria-hidden="true"
          >
            {i + 1}
          </span>
          <span>{it}</span>
        </li>
      ))}
    </ol>
  );
}

function GuideBody({ guide }: { guide: DocumentHelpGuide }) {
  return (
    <div className="space-y-3">
      <Section title="What this document is" icon={<FileText className="w-4 h-4" />}>
        <p>{guide.whatItIs}</p>
      </Section>

      <Section
        title="How to create it"
        icon={<ArrowRight className="w-4 h-4" />}
      >
        <Steps items={guide.howToCreate} />
      </Section>

      <Section
        title="How to create it professionally"
        icon={<Check className="w-4 h-4 text-[#1a7f4b]" />}
        tone="plain"
      >
        <Bullets items={guide.howToCreateWell} />
      </Section>

      <Section
        title="What you can edit after creation"
        icon={<Pencil className="w-4 h-4" />}
        tone="edit"
      >
        {guide.canEditAfterCreation.length ? (
          <Bullets items={guide.canEditAfterCreation} />
        ) : (
          <p>Nothing — this document is fully locked after it is created.</p>
        )}
      </Section>

      <Section
        title="What you cannot edit after creation"
        icon={<Lock className="w-4 h-4" />}
        tone="locked"
      >
        <Bullets items={guide.cannotEditAfterCreation} />
      </Section>

      <Section
        title="What happens after creation"
        icon={<ShieldAlert className="w-4 h-4" />}
        tone="warn"
      >
        <Bullets items={guide.afterCreation} />
        <p className="mt-2 pt-2 border-t border-gray-100">
          <span className="font-semibold text-gray-700">Status path: </span>
          {guide.statusFlow.join(" \u2192 ")}
        </p>
      </Section>

      <Section
        title="View, download and print"
        icon={<Printer className="w-4 h-4" />}
      >
        <Bullets items={guide.viewDownloadPrint} />
      </Section>
    </div>
  );
}

export default function HelpPage() {
  const router = useRouter();
  const guides = allDocumentHelpGuides();
  const [activeKind, setActiveKind] = useState<DocumentKind>(guides[0].kind);
  const [openSample, setOpenSample] = useState<DocumentKind | null>(null);
  const active = guides.find((g) => g.kind === activeKind) ?? guides[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-[#fef2f2] text-[#93000b] flex items-center justify-center shrink-0">
          <CircleHelp className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-[#191c1e] tracking-tight">
            Help &amp; Guides
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Plain-language guides for every document BizLedger creates, and how
            each one behaves after it is saved.
          </p>
        </div>
      </div>

      <div className="bg-[#f7f9fb] border border-[#eceef0] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <BizLedgerLogo size="compact" />
        <p className="text-xs text-gray-600 leading-relaxed flex-1">
          Every document in BizLedger is checked twice before it is saved: an
          in-form warning tells you what will be locked, and a confirmation step
          summarises the document. Nothing is created until you confirm.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)] gap-5">
        {/* Document selector */}
        <nav
          className="lg:sticky lg:top-4 h-max bg-white rounded-xl border border-[#eceef0] overflow-hidden"
          aria-label="Document guides"
        >
          <div className="px-4 py-2.5 border-b border-[#eceef0] text-[11px] font-bold uppercase tracking-wider text-gray-400">
            Choose a document
          </div>
          <div className="p-2 flex lg:flex-col gap-1.5">
            {guides.map((g) => {
              const selected = g.kind === activeKind;
              return (
                <button
                  key={g.kind}
                  onClick={() => setActiveKind(g.kind)}
                  aria-current={selected ? "true" : undefined}
                  className={`flex-1 flex items-center gap-2.5 text-left px-3 py-2.5 rounded-lg text-xs font-semibold transition-colors ${
                    selected
                      ? "bg-[#fef2f2] text-[#93000b] border border-rose-100"
                      : "text-gray-600 border border-transparent hover:bg-gray-50"
                  }`}
                >
                  <Icon name={g.icon} className="text-[18px] shrink-0" />
                  {documentKindLabel(g.kind)}s
                </button>
              );
            })}
          </div>
        </nav>

        {/* Selected guide */}
        <div className="space-y-4 min-w-0">
          <div className="bg-white rounded-xl border border-[#eceef0] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#eceef0] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-[#191c1e]">
                  {documentKindLabel(active.kind)} guide
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Create it, understand what is locked, and find it afterwards.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setOpenSample(active.kind)}
                  className="inline-flex items-center gap-1.5 border border-[#ecd7d7] text-[#93000b] hover:border-[#93000b] bg-white rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors"
                >
                  <FileText className="w-4 h-4" />
                  View sample &amp; learn
                </button>
                <button
                  onClick={() => router.push(active.route)}
                  className="inline-flex items-center gap-1.5 bg-[#93000b] hover:bg-[#770008] text-white rounded-xl px-3.5 py-2 text-xs font-bold transition-colors"
                >
                  Go to {documentKindLabel(active.kind)}s
                </button>
              </div>
            </div>
            <div className="p-5">
              <GuideBody guide={active} />
            </div>
          </div>
        </div>
      </div>

      {openSample && (
        <DocumentExperienceModal
          kind={openSample}
          onClose={() => setOpenSample(null)}
        />
      )}
    </div>
  );
}
