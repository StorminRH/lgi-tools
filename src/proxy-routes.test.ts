import { describe, expect, it } from "vitest";
import { classifyProxyPath } from "./proxy-routes";

describe("classifyProxyPath", () => {
  it("forwards a published site to its Codex page", () => {
    expect(classifyProxyPath("/sites/3", false)).toEqual({ kind: "redirect", location: "/codex/sites/3" });
  });

  it("forwards a zero-padded site id to the canonical Codex key", () => {
    expect(classifyProxyPath("/sites/007", false)).toEqual({ kind: "redirect", location: "/codex/sites/7" });
  });

  it.each(["/sites/0", "/sites/70", "/sites/100", "/sites/abc", "/sites/12abc", "/sites/-1"])(
    "answers not found for the unpublished or malformed site path %s",
    (pathname) => {
      expect(classifyProxyPath(pathname, false)).toEqual({ kind: "not-found" });
    },
  );

  it.each(["/sites", "/sites/3/opengraph-image"])("leaves %s alone", (pathname) => {
    expect(classifyProxyPath(pathname, false)).toEqual({ kind: "next" });
  });

  it("sends a signed-in viewer of the Codex home to the route that carries New guide", () => {
    expect(classifyProxyPath("/codex", true)).toEqual({ kind: "rewrite", pathname: "/codex/edit" });
  });

  it("sends a signed-in viewer of a Codex page to the editor route", () => {
    expect(classifyProxyPath("/codex/sites/20", true)).toEqual({ kind: "rewrite", pathname: "/codex/sites/20/edit" });
  });

  it.each([true, false])("answers not found for an unpublished Codex site (signed in: %s)", (signedIn) => {
    expect(classifyProxyPath("/codex/sites/70", signedIn)).toEqual({ kind: "not-found" });
  });

  it.each(["/codex/sites/007", "/codex/wormholes/k162", "/codex/wormholes/C247", "/codex/nope/x"])(
    "answers not found for the malformed Codex path %s",
    (pathname) => {
      expect(classifyProxyPath(pathname, true)).toEqual({ kind: "not-found" });
    },
  );

  it.each(["/codex", "/codex/sites", "/codex/sites/20/history", "/codex/wormholes/z999"])(
    "leaves %s to the page for a signed-out reader",
    (pathname) => {
      expect(classifyProxyPath(pathname, false)).toEqual({ kind: "next" });
    },
  );
});
