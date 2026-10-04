import { getSessionCookie } from "better-auth/cookies";
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

const CODEX_EDIT_PATH = /^\/codex(\/[^/]+\/[^/]+)?$/;

function routeResponse(request: NextRequest, isUnpublishedSite: boolean): NextResponse {
  if (isUnpublishedSite) return NextResponse.rewrite(new URL("/_not-found", request.url), { status: 404 });
  // Only signed-in viewers reach the Codex routes that carry the editor, so signed-out readers never download it.
  if (!CODEX_EDIT_PATH.test(request.nextUrl.pathname) || !getSessionCookie(request)) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = `${url.pathname}/edit`;
  return NextResponse.rewrite(url);
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
    img-src 'self' blob: data: https://images.evetech.net https://*.public.blob.vercel-storage.com https://i.ytimg.com;
    font-src 'self';
    connect-src 'self' https://login.eveonline.com https://*.vercel-insights.com https://vercel.com${CONVEX_CONNECT_SRC};
    frame-src https://www.youtube-nocookie.com https://player.twitch.tv https://clips.twitch.tv;
    frame-ancestors 'none';
    form-action 'self';
    base-uri 'self';
    object-src 'none';
    upgrade-insecure-requests;
  `
    .replace(/\s{2,}/g, " ")
    .trim();

  const isUnpublishedSite = isUnpublishedDirectSitePath(request.nextUrl.pathname);
  const response = routeResponse(request, isUnpublishedSite);
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
    { source: "/codex" },
    { source: "/codex/:kind/:key" },
  ],
};
