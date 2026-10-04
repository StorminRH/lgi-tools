import type { NextConfig } from "next";

const SECURITY_HEADERS = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Validate every page's navigations for instant UI in development and
    // report what would block. Pinned so a framework default change cannot
    // quietly switch it off.
    instantInsights: { validationLevel: "warning" },
  },
  images: {
    imageSizes: [32, 64, 128, 256, 512],
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
      {
        // Active jobs moved from a tab on /industry to its own section.
        source: "/industry",
        has: [{ type: "query", key: "tab", value: "jobs" }],
        destination: "/industry/jobs",
        permanent: false,
      },
      // Legacy industry URLs land on their workspace sections before any page
      // renders. Their query strings carry across.
      {
        source: "/jobs",
        destination: "/industry/jobs",
        permanent: false,
      },
      {
        source: "/structures",
        destination: "/industry?panel=structures",
        permanent: false,
      },
      {
        // Build templates are set aside for now.
        source: "/industry/templates",
        destination: "/industry",
        permanent: false,
      },
      {
        source: "/settings",
        destination: "/settings/characters",
        permanent: false,
      },
      {
        source: "/characters",
        destination: "/settings/characters",
        permanent: false,
      },
      {
        source: "/admin/access/:path*",
        destination: "/admin/users/:path*",
        permanent: false,
      },
      {
        source: "/settings/access/:path*",
        destination: "/admin/users/:path*",
        permanent: false,
      },
      {
        source: "/skills",
        destination: "/",
        permanent: true,
      },
      {
        source: "/admin/usage",
        destination: "/admin",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
