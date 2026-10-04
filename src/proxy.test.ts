import { getRewrittenUrl, isRewrite, unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
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

describe("proxy site detail fallback", () => {
  it.each(["/sites/1", "/sites/69"])(
    "allows the published boundary path %s to continue",
    (pathname) => {
      const response = proxy(request(pathname));

      expect(isRewrite(response)).toBe(false);
      expect(response.status).toBe(200);
    },
  );

  it.each([
    "/sites/0",
    "/sites/70",
    "/sites/100",
    "/sites/abc",
    "/sites/12abc",
    "/sites/-1",
  ])("rewrites the unpublished or malformed direct path %s", (pathname) => {
    const response = proxy(request(pathname));

    expect(isRewrite(response)).toBe(true);
    expect(response.status).toBe(404);
  });

  it("rewrites an unpublished site to the internal not-found route", () => {
    const response = proxy(request("/sites/100"));

    expect(getRewrittenUrl(response)).toBe(`${CANONICAL_ORIGIN}/_not-found`);
    expect(response.status).toBe(404);
  });

  it("marks a canonical-host unpublished site noindex", () => {
    const response = proxy(request("/sites/100"));

    expect(response.headers.get("X-Robots-Tag")).toBe("noindex");
  });

  it("leaves a canonical-host published site indexable", () => {
    const response = proxy(request("/sites/3"));

    expect(response.headers.get("X-Robots-Tag")).toBeNull();
  });

  it.each([
    "/sites/100/opengraph-image",
    "/sites/abc/opengraph-image",
  ])("does not intercept the nested path %s", (pathname) => {
    const response = proxy(request(pathname));

    expect(isRewrite(response)).toBe(false);
    expect(response.status).toBe(200);
  });

  it.each(["/sites/3", "/sites/100"])(
    "preserves the Content-Security-Policy header for %s",
    (pathname) => {
      const response = proxy(request(pathname));

      expect(response.headers.get("Content-Security-Policy")).toContain(
        "default-src 'self'",
      );
    },
  );

  it.each(["/sites/3", "/sites/100"])(
    "marks preview-host responses noindex for %s",
    (pathname) => {
      const response = proxy(request(pathname, PREVIEW_HOST));

      expect(response.headers.get("X-Robots-Tag")).toBe("noindex");
    },
  );
});

describe("proxy Codex admin route", () => {
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
      `${CANONICAL_ORIGIN}/codex/guides/rolling-a-c3/admin?edit=ships`,
    );
    expect(response.headers.get("Content-Security-Policy")).toContain("default-src 'self'");
  });

  it("runs on Codex page prefetches so a signed-in prefetch also gets the editor route", () => {
    const prefetch = { "next-router-prefetch": "1" };

    expect(unstable_doesMiddlewareMatch({ config, url: "/codex/guides/rolling-a-c3", headers: prefetch })).toBe(true);
    expect(unstable_doesMiddlewareMatch({ config, url: "/sites/3", headers: prefetch })).toBe(false);
  });

  it("serves the reader route to a signed-out viewer", () => {
    const response = proxy(codexRequest("/codex/guides/rolling-a-c3", "theme=dark"));

    expect(isRewrite(response)).toBe(false);
  });

  it("sends a signed-in viewer of the Codex home to the route that carries New guide, keeping the search", () => {
    const response = proxy(codexRequest("/codex?q=c247", "better-auth.session_token=abc"));

    expect(getRewrittenUrl(response)).toBe(`${CANONICAL_ORIGIN}/codex/admin?q=c247`);
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
