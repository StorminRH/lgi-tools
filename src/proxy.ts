import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SITE_URL } from "@/config/site-url";
import { isPublishedWormholeSiteId } from "@/features/wormhole-sites/catalogue-boundary";
import { parseNumericRouteId } from "@/transport/route-id";

const CANONICAL_HOST = new URL(SITE_URL).host;

function isUnpublishedDirectSitePath(pathname: string): boolean {
  const rawId = /^\/sites\/([^/]+)$/.exec(pathname)?.[1];
  if (rawId === undefined) return false;

  const id = parseNumericRouteId(rawId);
  return id === null || !isPublishedWormholeSiteId(id);
}

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;
const CONVEX_CONNECT_SRC = (() => {
  if (!CONVEX_URL) return "";
  const url = new URL(CONVEX_URL);
  const wsScheme = url.protocol === "http:" ? "ws:" : "wss:";
  return ` ${url.origin} ${wsScheme}//${url.host}`;
})();

export function proxy(request: NextRequest): NextResponse {
  const isDev = process.env.NODE_ENV === "development";

  const cspHeader = `
    default-src 'self';
    script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""};
    style-src 'self' 'unsafe-inline';
    img-src 'self' blob: data: https://images.evetech.net;
    font-src 'self';
    connect-src 'self' https://login.eveonline.com https://*.vercel-insights.com${CONVEX_CONNECT_SRC};
    frame-src 'none';
    frame-ancestors 'none';
    form-action 'self';
    base-uri 'self';
    object-src 'none';
    upgrade-insecure-requests;
  `
    .replace(/\s{2,}/g, " ")
    .trim();

  const isUnpublishedSite = isUnpublishedDirectSitePath(request.nextUrl.pathname);
  const response = isUnpublishedSite
    ? NextResponse.rewrite(new URL("/_not-found", request.url), { status: 404 })
    : NextResponse.next();
  response.headers.set("Content-Security-Policy", cspHeader);

  const host = request.headers.get("host");
  if (isUnpublishedSite || !host || host !== CANONICAL_HOST) {
    response.headers.set("X-Robots-Tag", "noindex");
  }
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico|icon.svg).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
