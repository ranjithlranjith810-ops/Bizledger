// Network trust configuration for Better Auth (client-IP resolution and
// cross-origin allowlist). Pure functions — no imports, no side effects — so
// the exact production posture is unit-testable without a server.
//
//   resolveIpAddressConfig  -> advanced.ipAddress for the auth server.
//   parseTrustedOrigins     -> production trustedOrigins allowlist.
//
// Rules (Fix 4 / Fix 5 of the authentication security audit):
//   - In production the app NEVER blindly trusts an arbitrary client-supplied
//     X-Forwarded-For header. It only honors forwarded headers when the caller
//     explicitly names its reverse proxies via TRUSTED_PROXIES.
//   - Without TRUSTED_PROXIES, production refuses forwarded headers entirely
//     (ipAddressHeaders: []) and Better Auth falls back to its single shared
//     per-path bucket — coarser, but never spoofable.
//   - Development keeps Better Auth's default behavior (single-value header
//     honored, localhost fallback) so local tooling and the throttle suites
//     keep using X-Forwarded-For to isolate runs.
//   - Wildcard origins are never allowed in production trustedOrigins.

export interface IpAddressConfiguration {
  trustedProxies?: string[];
  ipAddressHeaders?: string[];
}

/** Split a comma-separated `TRUSTED_PROXIES` env value into trimmed entries. */
export function parseTrustedProxies(raw: string | undefined): string[] {
  if (!raw || !raw.trim()) return [];
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/**
 * Decide how Better Auth resolves the client IP for rate limiting.
 *
 * @param nodeEnv            process.env.NODE_ENV
 * @param trustedProxiesEnv  process.env.TRUSTED_PROXIES (IPs/CIDRs of the proxies)
 */
export function resolveIpAddressConfig(
  nodeEnv: string,
  trustedProxiesEnv: string | undefined,
): IpAddressConfiguration {
  if (nodeEnv === "production") {
    const trustedProxies = parseTrustedProxies(trustedProxiesEnv);
    if (trustedProxies.length > 0) {
      return { trustedProxies };
    }
    // Production with no explicit trust boundary: refuse to believe any
    // client-supplied forwarded header. Better Auth then keys rate limiting on
    // a shared per-path bucket (see its "no-trusted-ip" fallback).
    return { ipAddressHeaders: [] };
  }
  return {};
}

/**
 * Split a comma-separated `TRUSTED_ORIGINS` env value into a production
 * allowlist. Wildcard entries are dropped: a wildcard trusted origin is never
 * permitted. Returns [] (same-origin only) when the variable is unset.
 */
export function parseTrustedOrigins(raw: string | undefined): string[] {
  if (!raw || !raw.trim()) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const origin = part.trim();
    if (!origin) continue;
    if (origin.includes("*")) continue;
    // Only absolute http(s) origins are meaningful to Better Auth.
    if (!/^https?:\/\/\S+$/i.test(origin)) continue;
    if (seen.has(origin)) continue;
    seen.add(origin);
    out.push(origin);
  }
  return out;
}