import { getRewrittenUrl, isRewrite } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "./proxy";

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
