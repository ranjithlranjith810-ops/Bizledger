/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: import.meta.dirname,
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  async headers() {
    // Production security headers on every route. HSTS is only emitted in a
    // production build served over HTTPS — gated on NODE_ENV (this config is
    // what `next build` bakes) AND an https deployment origin, never on the
    // URL string alone. Local http:// dev servers never receive it.
    const baseUrl = process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
    const isHttps = baseUrl.startsWith("https://");
    const isProd = process.env.NODE_ENV === "production";
    const isProdHttps = isProd && isHttps;
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          // CSP-Report-Only (Phase 9C-5G): announces the intended policy WITHOUT
          // blocking. Sources cover the app's real third-party surface:
          //   - Google OAuth  (redirect flow; server-side exchange)
          //   - Razorpay checkout (checkout.js script + payment iframe + API)
          //   - Material Symbols / fonts (Google Fonts)
          //   - Next.js /_next assets ('self')
          // 'unsafe-inline' on script/style is required because Next.js
          // bootstraps inline — enforcing this policy needs nonce-based CSP,
          // which is a separate follow-up (deliberately not enabled here).
          // Migration path: run with this report-only header, collect
          // violations, tighten, then flip to Content-Security-Policy.
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self)" },
          ...(isProdHttps
            ? [
                {
                  key: "Content-Security-Policy-Report-Only",
                  value: [
                    "default-src 'self'",
                    "script-src 'self' 'unsafe-inline' https://checkout.razorpay.com https://api.razorpay.com",
                    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
                    "font-src 'self' data: https://fonts.gstatic.com",
                    "img-src 'self' data: blob:",
                    "connect-src 'self' https://checkout.razorpay.com https://api.razorpay.com",
                    "frame-src 'self' https://checkout.razorpay.com",
                    "frame-ancestors 'self'",
                    "form-action 'self' https://accounts.google.com",
                    "base-uri 'self'",
                    "object-src 'none'",
                    "upgrade-insecure-requests",
                  ].join("; "),
                },
              ]
            : []),
          ...(isProdHttps
            ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]
            : []),
        ],
      },
    ];
  },
};

export default nextConfig;