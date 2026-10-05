import Image from "next/image";

// Official BizLedger loading logo. Rendered as-is (transparency preserved, no
// redrawing) at the sizes below, with the red circular loader underneath.
const LOGO_SRC = "/branding/logo-loading.png";

const SIZES = {
  sm: { logo: 48, ring: 20 },
  md: { logo: 72, ring: 26 },
  lg: { logo: 120, ring: 34 },
} as const;

export type BizLedgerLoaderSize = keyof typeof SIZES;

interface BizLedgerLoaderProps {
  /** Defaults to "md". Use "lg" for full-screen/initial loads. */
  size?: BizLedgerLoaderSize;
  className?: string;
  /** Accessible label; also the default is exposed as the aria-label. */
  label?: string;
}

// The branded loading block: centered logo with a red circular arc below it.
// The arc is a partially-visible segment (top border) rotating around a light
// neutral track (the remaining border), driven by the shared
// `animate-bizledger-spin` keyframe (see globals.css). Reduced-motion users get
// a slower, calmer rotation instead of an abrupt stop.
export function BizLedgerLoader({
  size = "md",
  className = "",
  label = "Loading",
}: BizLedgerLoaderProps) {
  const { logo, ring } = SIZES[size];
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      className={`flex flex-col items-center justify-center ${className}`}
    >
      <Image
        src={LOGO_SRC}
        width={logo}
        height={logo}
        alt=""
        draggable={false}
        className="select-none object-contain"
        unoptimized
        priority
      />
      <span
        aria-hidden="true"
        className="mt-5 block rounded-full border-[3px] border-[color:var(--color-surface-container-high)] border-t-[color:var(--color-primary)] animate-bizledger-spin"
        style={{ width: ring, height: ring }}
      />
    </div>
  );
}