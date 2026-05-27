import type { NextConfig } from "next";

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
};

export default nextConfig;
