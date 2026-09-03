import Image from "next/image";

const LOGO_SRC = "/branding/BIZ-LEDGER LOGO.png";

const SIZES = {
  compact: { w: 32, h: 32 },
  default: { w: 40, h: 40 },
  large: { w: 88, h: 88 },
} as const;

export type BizLedgerLogoSize = keyof typeof SIZES;

interface BizLedgerLogoProps {
  size?: BizLedgerLogoSize;
  className?: string;
  alt?: string;
}

export function BizLedgerLogo({
  size = "default",
  className = "",
  alt = "BizLedger",
}: BizLedgerLogoProps) {
  const { w, h } = SIZES[size];
  return (
    <Image
      src={LOGO_SRC}
      width={w}
      height={h}
      alt={alt}
      draggable={false}
      className={`rounded-md object-contain shrink-0 select-none ${className}`}
    />
  );
}
