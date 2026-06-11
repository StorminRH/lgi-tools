import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SITE_URL } from "@/config/site-url";

// The one host that should ever be indexed. Every other host that reaches the
// app — preview/branch aliases, a stray `www`, or the production `*.vercel.app`
// alias — gets `X-Robots-Tag: noindex` below. Today Vercel Deployment
// Protection already 401s those aliases at the edge (before this runs), but
// that's a dashboard toggle; stamping the header here is the code-level
// guarantee that they can never be indexed even if protection is turned off.
const CANONICAL_HOST = new URL(SITE_URL).host;

// The Convex backend origin for connect-src (3.4.3). A literal NEXT_PUBLIC_*
// read is inlined into this bundle at BUILD time (define-env covers the
// node/edge server targets, verified in next@16.2.6) — which is required: on
// Vercel the value exists ONLY in the build env, injected per deployment by
// `npx convex deploy --cmd-url-env-var-name`, so prod and every preview get
// their exact backend origin (https for the initial handshake, wss for the
// reactive websocket). Deliberately NOT a `*.convex.cloud` wildcard — that
// would admit every Convex customer's backend as a connect target. Unset
// (a Convex-less local build) leaves the policy byte-identical to before.
const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;
const CONVEX_CONNECT_SRC = CONVEX_URL
  ? ` https://${new URL(CONVEX_URL).host} wss://${new URL(CONVEX_URL).host}`
  : "";

// Per-request Content-Security-Policy. Through 3.0.4.5 this used a fresh
// per-request nonce (`script-src 'self' 'nonce-…' 'strict-dynamic'`), which
// forced every route to dynamic rendering. 3.0.4.6 retired the nonce — the
// conversion-track enabler — for a basic origin-locked policy: scripts and
// styles load only from our own origin (`'self'`), with `'unsafe-inline'`
// admitting the inline RSC flight-data scripts that hydration needs.
//
// Why `'unsafe-inline'` and not a stricter form: every App Router page emits
// inline `self.__next_f.push(...)` scripts that `'self'` alone can't bless, and
// the nonce that used to bless them is what we're removing. Subresource
// Integrity doesn't help — it signs only external script files, never inline
// content (re-confirmed empirically in 3.0.4.6; see
// docs/VERSION_3.0.4.3_CSP_DECISION.md). This keeps origin-level XSS protection
// (no third-party script hosts, no object/base/frame vectors) while dropping the
// per-request mechanism that fought the stack. The header is still emitted from
// proxy.ts per request; relocating/caching it is a later conversion-track step.
//
// Static security headers (HSTS, X-Frame-Options, etc.) live in next.config.ts
// so they apply to API responses too.
export function proxy(request: NextRequest): NextResponse {
  const isDev = process.env.NODE_ENV === "development";

  // Dev-only relaxations: `'unsafe-eval'` (React rebuilds server-side error
  // stacks via eval in dev) and `'unsafe-inline'` on style-src (Fast Refresh /
  // HMR injects nonce-less inline <style> tags). Production keeps `style-src
  // 'self'` — styles ship in the external stylesheet — which still drops inline
  // `style="…"` attributes, so the 3.0.4.4 inline-style lint rule stays correct.
  const cspHeader = `
    default-src 'self';
    script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""};
    style-src 'self'${isDev ? " 'unsafe-inline'" : ""};
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

  const response = NextResponse.next();
  response.headers.set("Content-Security-Policy", cspHeader);

  // Anything that isn't positively the canonical host must never be indexed —
  // see CANONICAL_HOST above. Fail closed: an absent/unknown Host (never the
  // case for a real HTTP/1.1 request) is treated as non-canonical too, so the
  // only host that stays indexable is lgi.tools itself.
  const host = request.headers.get("host");
  if (!host || host !== CANONICAL_HOST) {
    response.headers.set("X-Robots-Tag", "noindex");
  }
  return response;
}

// Skip API routes (JSON responses don't need CSP), Next.js static + image
// optimizer paths, the favicon, and prefetch requests. Prefetches re-use the
// initial document's CSP header, so adding it per-prefetch would only burn CPU.
// Same pattern recommended in the Next 16 CSP guide.
export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
