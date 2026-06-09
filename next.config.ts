import type { NextConfig } from "next";

// Static security headers applied to every response (page routes + API
// routes). The `Content-Security-Policy` itself is set by proxy.ts — a basic
// origin-locked policy since 3.0.4.6 (no per-request nonce); everything below
// is safe to bake in once at config time.
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
  // Cache Components (Next 16): enables the stable `use cache` directive and
  // makes Partial Prerendering the default — routes prerender a static shell
  // and stream genuinely per-request data from `<Suspense>` holes. This is what
  // takes the site off the all-dynamic path, now that the nonce CSP that blocked
  // static rendering is gone (3.0.4.6). It also drives `use cache`/`cacheLife`/
  // `cacheTag`; do not reintroduce a script nonce without re-checking this.
  cacheComponents: true,
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
  async redirects() {
    return [
      // 3.4.2 consolidated the tabbed usage report into the /admin dashboard.
      // Non-permanent so browsers don't cache the hop forever; query params
      // (?range=) forward automatically, so old bookmarks keep their range.
      {
        source: "/admin/usage",
        destination: "/admin",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
