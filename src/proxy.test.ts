import { getRedirectUrl, getRewrittenUrl, isRewrite, unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { config, proxy } from "./proxy";

const CANONICAL_ORIGIN = "https://lgi.tools";
const PREVIEW_HOST = "lgi-tools-preview.vercel.app";

function request(pathname: string, host = "lgi.tools"): NextRequest {
  return new NextRequest(`https://${host}${pathname}`, {
    headers: { host },
  });
}

describe("proxy site detail handoff", () => {
  it("permanently forwards a published site to its Codex page", () => {
    const response = proxy(request("/sites/3"));

    expect(response.status).toBe(308);
    expect(getRedirectUrl(response)).toBe(`${CANONICAL_ORIGIN}/codex/sites/3`);
    expect(response.headers.get("X-Robots-Tag")).toBeNull();
    expect(response.headers.get("Content-Security-Policy")).toContain("default-src 'self'");
  });

  it("drops the query when it forwards a site", () => {
    expect(getRedirectUrl(proxy(request("/sites/3?type=relic")))).toBe(`${CANONICAL_ORIGIN}/codex/sites/3`);
  });

  it.each(["/sites/0", "/sites/70", "/sites/100", "/sites/abc", "/sites/12abc", "/sites/-1"])(
    "rewrites the unpublished or malformed direct path %s to a noindexed not-found",
    (pathname) => {
      const response = proxy(request(pathname));

      expect(getRewrittenUrl(response)).toBe(`${CANONICAL_ORIGIN}/_not-found`);
      expect(response.status).toBe(404);
      expect(response.headers.get("X-Robots-Tag")).toBe("noindex");
      expect(response.headers.get("Content-Security-Policy")).toContain("default-src 'self'");
    },
  );

  it.each(["/sites/100/opengraph-image", "/sites/abc/opengraph-image"])(
    "does not intercept the nested path %s",
    (pathname) => {
      const response = proxy(request(pathname));

      expect(isRewrite(response)).toBe(false);
      expect(response.status).toBe(200);
    },
  );

  it.each(["/sites/3", "/sites/100"])("marks preview-host responses noindex for %s", (pathname) => {
    const response = proxy(request(pathname, PREVIEW_HOST));

    expect(response.headers.get("X-Robots-Tag")).toBe("noindex");
  });
});

describe("proxy Codex edit route", () => {
  function codexRequest(pathname: string, cookie?: string): NextRequest {
    return new NextRequest(`https://lgi.tools${pathname}`, {
      headers: cookie ? { host: "lgi.tools", cookie } : { host: "lgi.tools" },
    });
  }

  it.each([
    "better-auth.session_token=abc",
    "__Secure-better-auth.session_token=abc",
  ])("sends a signed-in viewer (%s) to the route that carries the editor", (cookie) => {
    const response = proxy(codexRequest("/codex/guides/rolling-a-c3?edit=ships", cookie));

    expect(getRewrittenUrl(response)).toBe(
      `${CANONICAL_ORIGIN}/codex/guides/rolling-a-c3/edit?edit=ships`,
    );
    expect(response.headers.get("Content-Security-Policy")).toContain("default-src 'self'");
  });

  it("runs on Codex page and site detail prefetches so they get the editor route and the redirect", () => {
    const prefetch = { "next-router-prefetch": "1" };

    expect(unstable_doesMiddlewareMatch({ config, url: "/codex/guides/rolling-a-c3", headers: prefetch })).toBe(true);
    expect(unstable_doesMiddlewareMatch({ config, url: "/sites/3", headers: prefetch })).toBe(true);
  });

  it("answers an unpublished Codex site with a noindexed not-found even when signed in", () => {
    const response = proxy(codexRequest("/codex/sites/70", "better-auth.session_token=abc"));

    expect(getRewrittenUrl(response)).toBe(`${CANONICAL_ORIGIN}/_not-found`);
    expect(response.status).toBe(404);
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex");
  });

  it("serves the reader route to a signed-out viewer", () => {
    const response = proxy(codexRequest("/codex/guides/rolling-a-c3", "theme=dark"));

    expect(isRewrite(response)).toBe(false);
  });

  it("sends a signed-in viewer of the Codex home to the route that carries New guide, keeping the search", () => {
    const response = proxy(codexRequest("/codex?q=c247", "better-auth.session_token=abc"));

    expect(getRewrittenUrl(response)).toBe(`${CANONICAL_ORIGIN}/codex/edit?q=c247`);
    expect(unstable_doesMiddlewareMatch({ config, url: "/codex", headers: { "next-router-prefetch": "1" } })).toBe(true);
    expect(isRewrite(proxy(codexRequest("/codex", "theme=dark")))).toBe(false);
  });

  it.each(["/codex/guides", "/codex/guides/rolling-a-c3/history"])(
    "leaves %s alone for a signed-in viewer",
    (pathname) => {
      const response = proxy(codexRequest(pathname, "better-auth.session_token=abc"));

      expect(isRewrite(response)).toBe(false);
    },
  );
});

describe("proxy content security policy", () => {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL ? new URL(process.env.NEXT_PUBLIC_CONVEX_URL) : null;
  const convex = convexUrl
    ? ` ${convexUrl.origin} ${convexUrl.protocol === "http:" ? "ws:" : "wss:"}//${convexUrl.host}`
    : "";
  const POLICY =
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' blob: data: https://images.evetech.net https://*.public.blob.vercel-storage.com https://i.ytimg.com; " +
    "font-src 'self'; " +
    "connect-src 'self' https://login.eveonline.com https://*.vercel-insights.com https://vercel.com" +
    convex +
    "; frame-src https://www.youtube-nocookie.com https://player.twitch.tv https://clips.twitch.tv; " +
    "frame-ancestors 'none'; form-action 'self'; base-uri 'self'; object-src 'none'; upgrade-insecure-requests;";

  it("allows Codex screenshots, video thumbnails, and the YouTube and Twitch players and nothing else", () => {
    const policy = proxy(request("/codex/guides/rolling-a-c3")).headers.get("Content-Security-Policy");

    expect(policy).toBe(POLICY);
    expect(policy).not.toContain("frame-src 'none'");
  });

  it.each([
    ["the site redirect", "/sites/3", undefined],
    ["the not-found", "/codex/sites/70", undefined],
    ["the Codex home rewrite", "/codex", "better-auth.session_token=abc"],
    ["the Codex page rewrite", "/codex/sites/20", "better-auth.session_token=abc"],
  ])("sends the same policy on %s", (_label, pathname, cookie) => {
    const response = proxy(
      new NextRequest(`https://lgi.tools${pathname}`, {
        headers: cookie ? { host: "lgi.tools", cookie } : { host: "lgi.tools" },
      }),
    );

    expect(response.headers.get("Content-Security-Policy")).toBe(POLICY);
  });
});
