import { NextResponse, type NextRequest } from "next/server";

// Per-request Content-Security-Policy with a fresh nonce. Next 16 renamed
// `middleware.ts` to `proxy.ts` and the exported function from `middleware`
// to `proxy` (runtime is nodejs, not Edge — `crypto.randomUUID()` and
// `Buffer` work natively, no polyfills required).
//
// We use the `'strict-dynamic'` directive so Next.js's framework scripts
// (which carry the nonce) can in turn load Speed Insights' beacon and any
// other dynamically-injected trusted scripts without explicit allowlisting.
//
// Static security headers (HSTS, X-Frame-Options, etc.) live in
// next.config.ts so they apply uniformly to API responses too — the CSP
// is the only header that needs per-request state.
export function proxy(request: NextRequest): NextResponse {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";

  // Dev mode notes:
  //   - `'unsafe-eval'` is required because React uses `eval` to reconstruct
  //     server-side error stacks in the browser during dev.
  //   - `'unsafe-inline'` on style-src preserves Next.js Fast Refresh / HMR,
  //     which injects inline <style> tags without nonces. Production sticks
  //     to a strict `'nonce-…'` for styles.
  const cspHeader = `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""};
    style-src 'self' 'nonce-${nonce}'${isDev ? " 'unsafe-inline'" : ""};
    img-src 'self' blob: data: https://images.evetech.net;
    font-src 'self';
    connect-src 'self' https://login.eveonline.com https://esi.evetech.net https://discord.com https://*.vercel-insights.com;
    frame-src 'none';
    frame-ancestors 'none';
    form-action 'self';
    base-uri 'self';
    object-src 'none';
    upgrade-insecure-requests;
  `
    .replace(/\s{2,}/g, " ")
    .trim();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", cspHeader);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set("Content-Security-Policy", cspHeader);
  return response;
}

// Skip API routes (JSON responses don't need CSP), Next.js static + image
// optimizer paths, the favicon, and prefetch requests. Prefetches re-use the
// initial document's CSP header, so adding nonces per-prefetch would only
// burn CPU. Same pattern recommended in the Next 16 CSP guide.
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
