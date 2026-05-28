import type { NextConfig } from "next";

// Static security headers applied to every response (page routes + API
// routes). The dynamic, per-request `Content-Security-Policy` is set by
// proxy.ts so that each page gets a unique nonce; everything below is
// safe to bake in once at config time.
const SECURITY_HEADERS = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  // Defence-in-depth alongside CSP's `frame-ancestors 'none'` — legacy
  // browsers without CSP-level3 still honour this.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Locks down feature policy for surfaces we never use and opts out of
  // FLoC interest cohorts.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  // CCP's official third-party image server. Serves character portraits today
  // (used by the login chip and admin dashboard) and will serve type icons,
  // blueprint art, and ship renders for the 3.1 Industry Planner visual pass.
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.evetech.net",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;
