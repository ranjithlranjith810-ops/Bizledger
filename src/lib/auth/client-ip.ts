// Centralized client-IP resolution for the APP rate limiter (`@/lib/rate-limit`).
//
// WHY THIS EXISTS. `rate-limit.ts:getClientIp()` used to trust the FIRST
// `x-forwarded-for` token unconditionally. The leftmost token is the one a
// client controls: every standard reverse proxy (nginx
// `$proxy_add_x_forwarded_for`, AWS ALB, Vercel, Cloudflare) APPENDS the real
// connecting address to whatever the client already sent. So a caller could
// send `X-Forwarded-For: <anything>` and be handed a brand-new rate-limit
// bucket on every request — a complete bypass of team-invite, checkout,
// directory-submit and admin-mutation throttling. Better Auth's own limiter was
// never affected: `resolveIpAddressConfig` already refuses forwarded headers in
// production without TRUSTED_PROXIES. This module closes that divergence.
//
// SINGLE SOURCE OF TRUST. The trust decision is NOT re-implemented here. The
// caller passes the very same `IpAddressConfiguration` that
// `resolveIpAddressConfig(process.env.NODE_ENV, process.env.TRUSTED_PROXIES)`
// hands to Better Auth, so the two limiters can never disagree about whether a
// proxy is trusted. `trust-config.ts` remains the only definition of a
// "trusted proxy"; this file only implements how to WALK a forwarded chain once
// that decision has been made.
//
// SEMANTICS (identical to @better-auth/core `getIPFromHeader`, pinned by
// src/__tests__/client-ip-resolution.test.ts):
//   - trustedProxies configured -> walk the chain RIGHT to LEFT and return the
//     first hop that is NOT a trusted proxy. Everything to its left is
//     attacker-supplied and is discarded.
//   - no trustedProxies -> trust ONLY a single-value header, and only when it
//     parses as an IP. A multi-value chain is refused outright, because without
//     a trust anchor there is no way to tell which token the client wrote.
//   - production with `ipAddressHeaders: []` (no proxy declared) -> NO forwarded
//     header is read at all.
//   - nothing trustworthy -> `null`, which the caller MUST map to a single
//     shared bucket. Fail-closed: over-throttling, never under-throttling.
//
// Pure and dependency-free (bar the pure `trust-config` import), mirroring
// trust-config.ts, so the exact production posture is unit-testable without a
// server, a database, or a live request.

import type { IpAddressConfiguration } from "@/lib/auth/trust-config";

const V4_OCTETS = 4;
const V6_GROUPS = 8;

function parseIPv4(value: string): number[] | null {
  const parts = value.split(".");
  if (parts.length !== V4_OCTETS) return null;
  const bytes: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    bytes.push(n);
  }
  return bytes;
}

/** Expand a compressed IPv6 literal ("2001:db8::1") to its eight 16-bit groups. */
function parseIPv6(value: string): number[] | null {
  if (!value.includes(":")) return null;
  if (!/^[0-9a-fA-F:.]+$/.test(value)) return null;

  // An IPv4-mapped/suffixed literal ("::ffff:192.0.2.1") carries its address in
  // a dotted tail. Reduce it to plain IPv4 so both forms bucket identically.
  const lastColon = value.lastIndexOf(":");
  const tail = value.slice(lastColon + 1);
  if (tail.includes(".")) {
    const v4 = parseIPv4(tail);
    if (!v4) return null;
    const mapped = value
      .slice(0, lastColon + 1)
      .split(":")
      .filter((g) => g.length > 0);
    // "::ffff:1.2.3.4" -> five zero groups, then 0xffff, then the four octets:
    // 16 bytes total, so bytes[10] and bytes[11] are 0xff and normalizeIp can
    // collapse the mapped form onto plain IPv4.
    const allZeroOrFfff = mapped.every((g) => {
      if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return false;
      const n = parseInt(g, 16);
      return n === 0 || n === 0xffff;
    });
    if (allZeroOrFfff && mapped.length <= 1) {
      return [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xff, ...v4];
    }
    return null;
  }

  const [leftRaw, ...rest] = value.split("::");
  if (rest.length > 0) {
    // Only one "::" is legal.
    if (rest.filter((p) => p.includes("::")).length > 0) return null;
  }
  const left = leftRaw.split(":").filter((g) => g.length > 0);
  const right = rest.join(":").split(":").filter((g) => g.length > 0);
  const explicit = left.length + right.length;
  if (rest.length === 0) {
    if (explicit !== V6_GROUPS) return null;
  } else if (explicit >= V6_GROUPS) {
    return null;
  }
  const zeros = Array(V6_GROUPS - explicit).fill("0");
  const groups = [...left, ...zeros, ...right];
  const bytes: number[] = [];
  for (const group of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null;
    const n = parseInt(group, 16);
    bytes.push((n >> 8) & 0xff, n & 0xff);
  }
  return bytes.length === 16 ? bytes : null;
}

export function isValidIp(value: string): boolean {
  return parseIPv4(value) !== null || parseIPv6(value) !== null;
}

/** Raw bytes for CIDR comparison; null when `value` is not an IP literal. */
function ipToBytes(value: string): number[] | null {
  const v4 = parseIPv4(value);
  if (v4) return v4;
  const bytes = parseIPv6(value);
  if (!bytes) return null;
  // An IPv4-mapped IPv6 address is the SAME host and MUST compare as IPv4, or a
  // proxy configured as `10.0.0.0/8` would stop matching `::ffff:10.0.0.4` and a
  // trusted hop would silently stop being trusted.
  const mapped =
    bytes.slice(0, 10).every((b) => b === 0) &&
    bytes[10] === 0xff &&
    bytes[11] === 0xff;
  return mapped ? bytes.slice(12) : bytes;
}

interface ParsedCidr {
  bytes: number[];
  prefix: number;
}

/**
 * Parse an IP or `IP/prefix` entry. An invalid entry returns null so a typo in
 * TRUSTED_PROXIES can never silently behave as a wildcard match — it is simply
 * not a trusted proxy.
 */
export function parseCidr(value: string): ParsedCidr | null {
  const slash = value.lastIndexOf("/");
  const address = slash === -1 ? value : value.slice(0, slash);
  const bytes = ipToBytes(address);
  if (!bytes) return null;
  const maxBits = bytes.length * 8;
  if (slash === -1) return { bytes, prefix: maxBits };
  const prefixPart = value.slice(slash + 1);
  if (!/^\d+$/.test(prefixPart)) return null;
  const prefix = Number(prefixPart);
  return prefix <= maxBits ? { bytes, prefix } : null;
}

/** Whether `ipBytes` falls inside an already-parsed network. */
function matchesCidr(ipBytes: number[], network: ParsedCidr): boolean {
  if (ipBytes.length !== network.bytes.length) return false;
  let remaining = network.prefix;
  for (let i = 0; i < ipBytes.length && remaining > 0; i++) {
    const take = remaining >= 8 ? 8 : remaining;
    const mask = take === 8 ? 0xff : (0xff << (8 - take)) & 0xff;
    if (((ipBytes[i] ?? 0) & mask) !== ((network.bytes[i] ?? 0) & mask)) return false;
    remaining -= 8;
  }
  return true;
}

/**
 * Canonical form used as the rate-limit identity. IPv4-mapped IPv6 collapses
 * to its IPv4 form and IPv6 is bucketed by its /64 prefix, so one client can
 * never walk two buckets by switching address representation.
 */
export function normalizeIp(value: string, ipv6Subnet = 64): string {
  const v4 = parseIPv4(value);
  if (v4) return value.toLowerCase();
  const bytes = parseIPv6(value);
  if (!bytes) return value.toLowerCase();
  if (bytes[10] === 0xff && bytes[11] === 0xff) {
    return `${bytes[12]}.${bytes[13]}.${bytes[14]}.${bytes[15]}`;
  }
  let remaining = Math.max(0, Math.floor(ipv6Subnet));
  const groups: string[] = [];
  for (let i = 0; i < bytes.length; i += 2) {
    if (remaining <= 0) {
      groups.push("0000");
      continue;
    }
    const group = ((bytes[i] ?? 0) << 8) | (bytes[i + 1] ?? 0);
    if (remaining >= 16) {
      remaining -= 16;
      groups.push(group.toString(16).padStart(4, "0"));
      continue;
    }
    const masked = group & ((0xffff << (16 - remaining)) & 0xffff);
    remaining = 0;
    groups.push(masked.toString(16).padStart(4, "0"));
  }
  return groups.join(":").toLowerCase();
}

/**
 * Resolve the client IP from a forwarded header.
 *
 * Returns null when no trustworthy client IP can be established — the caller
 * must then use a single shared bucket rather than falling back to a
 * client-supplied value.
 */
export function getIpFromHeader(
  value: string,
  options: IpAddressConfiguration & { ipv6Subnet?: number } = {},
): string | null {
  const hops = value.split(",").map((hop) => hop.trim()).filter(Boolean);
  if (hops.length === 0) return null;

  const networks = (options.trustedProxies ?? [])
    .map(parseCidr)
    .filter((network): network is ParsedCidr => network !== null);

  if (networks.length > 0) {
    for (let i = hops.length - 1; i >= 0; i--) {
      const hop = hops[i];
      if (!hop) return null;
      const bytes = ipToBytes(hop);
      if (!bytes) return null;
      if (networks.some((network) => matchesCidr(bytes, network))) continue;
      return normalizeIp(hop, options.ipv6Subnet);
    }
    // Every hop is a trusted proxy: there is no client address in the chain.
    return null;
  }

  // Without a trust anchor only a lone, well-formed IP may be believed. A
  // multi-value chain is refused rather than guessed at.
  if (hops.length !== 1) return null;
  if (!isValidIp(hops[0] ?? "")) return null;
  return normalizeIp(hops[0] ?? "", options.ipv6Subnet);
}

/**
 * Full request-level resolution, honouring `ipAddressHeaders` in order (default
 * `x-forwarded-for`). Returns null when nothing trustworthy is available.
 */
export function getClientIpFromRequest(
  request: Request,
  options: IpAddressConfiguration & { ipv6Subnet?: number } = {},
): string | null {
  if (options.ipAddressHeaders && options.ipAddressHeaders.length === 0) {
    return null;
  }
  const headerNames = options.ipAddressHeaders ?? ["x-forwarded-for"];
  for (const name of headerNames) {
    const raw = request.headers.get(name);
    if (typeof raw !== "string" || raw.length === 0) continue;
    const ip = getIpFromHeader(raw, options);
    if (ip) return ip;
  }
  return null;
}