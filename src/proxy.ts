import { getSessionCookie } from "better-auth/cookies";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SITE_URL } from "@/config/site-url";
import { classifyProxyPath, type ProxyRoute } from "./proxy-routes";

const CANONICAL_HOST = new URL(SITE_URL).host;

function routeResponse(request: NextRequest, route: ProxyRoute): NextResponse {
  switch (route.kind) {
    case "not-found":
      return NextResponse.rewrite(new URL("/_not-found", request.url), { status: 404 });
    case "redirect":
      return NextResponse.redirect(new URL(route.location, request.url), 308);
    case "rewrite": {
      const url = request.nextUrl.clone();
      url.pathname = route.pathname;
      return NextResponse.rewrite(url);
    }
    case "next":
      return NextResponse.next();
  }
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

  const route = classifyProxyPath(request.nextUrl.pathname, Boolean(getSessionCookie(request)));
  const response = routeResponse(request, route);
  response.headers.set("Content-Security-Policy", cspHeader);

  const host = request.headers.get("host");
  if (route.kind === "not-found" || !host || host !== CANONICAL_HOST) {
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
    { source: "/sites/:id" },
    { source: "/codex/:kind/:key" },
  ],
};
