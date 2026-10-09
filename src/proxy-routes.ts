import { codexSiteHref, resolveCodexSubject } from "@/features/codex/subjects";
import { isPublishedWormholeSiteId } from "@/features/wormhole-sites/catalogue-boundary";
import { parseNumericRouteId } from "@/transport/route-id";

export type ProxyRoute =
  | { kind: "next" }
  | { kind: "not-found" }
  | { kind: "redirect"; location: string }
  | { kind: "rewrite"; pathname: string };

// Only signed-in viewers reach the Codex routes that carry the editor, so signed-out readers never download it.
const signedInEditorRoute = (editorPathname: string, signedIn: boolean): ProxyRoute =>
  signedIn ? { kind: "rewrite", pathname: editorPathname } : { kind: "next" };

const SITE_DETAIL_PATH = /^\/sites\/([^/]+)$/;
const CODEX_PAGE_PATH = /^\/codex\/([^/]+)\/([^/]+)$/;

function classifySitePath(rawId: string): ProxyRoute {
  const id = parseNumericRouteId(rawId);
  if (id === null || !isPublishedWormholeSiteId(id)) return { kind: "not-found" };
  return { kind: "redirect", location: codexSiteHref(id) };
}

function classifyCodexPath(pathname: string, kind: string, rawKey: string, signedIn: boolean): ProxyRoute {
  const subject = resolveCodexSubject(kind, rawKey);
  if (subject === null) return { kind: "not-found" };
  if (subject.kind === "sites" && !isPublishedWormholeSiteId(Number(subject.key))) return { kind: "not-found" };
  return signedInEditorRoute(`${pathname}/edit`, signedIn);
}

export function classifyProxyPath(pathname: string, signedIn: boolean): ProxyRoute {
  if (pathname === "/codex") return signedInEditorRoute("/codex/edit", signedIn);
  const site = SITE_DETAIL_PATH.exec(pathname);
  if (site) return classifySitePath(site[1]!);
  const codex = CODEX_PAGE_PATH.exec(pathname);
  if (codex) return classifyCodexPath(pathname, codex[1]!, codex[2]!, signedIn);
  return { kind: "next" };
}
