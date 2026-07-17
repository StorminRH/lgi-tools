/**
 * One caller-supplied content nav item; its value is the stable control key and its label or
 * marker is presentation-ready.
 */
export type ContentNavItem = {
  slug: string;
  title: string;
};

/** One titled content-navigation group with ordered document links ready for the shared browser sidebar. */
export type ContentNavGroup = {
  slug: string;
  title: string;
  items: ContentNavItem[];
};

/**
 * Display-ready content nav model consumed by the shared visualization layer; callers keep all
 * numeric values in one consistent unit.
 */
export type ContentNavModel = {
  items: ContentNavItem[];
  groups: ContentNavGroup[];
};

function normalizeBasePath(basePath: `/${string}`): `/${string}` {
  if (basePath === '/') return basePath;
  return basePath.replace(/\/+$/, '') as `/${string}`;
}

/**
 * Selects the canonical landing document slug from ordered content navigation, or null when the
 * navigation is empty.
 */
export function landingContentSlug(model: ContentNavModel): string | null {
  return model.items[0]?.slug ?? model.groups[0]?.items[0]?.slug ?? null;
}

/** Builds the stable browser URL for a content slug, collapsing the landing document to the section root. */
export function contentBrowserHref(
  basePath: `/${string}`,
  slug: string,
  landingSlug: string | null,
): string {
  const base = normalizeBasePath(basePath);
  if (slug === landingSlug) return base;
  return base === '/' ? `/${slug}` : `${base}/${slug}`;
}

/**
 * Resolves the active content slug from route, landing, and available-document inputs without
 * producing a link to missing content.
 */
export function deriveActiveContentSlug(
  pathname: string,
  basePath: `/${string}`,
  landingSlug: string | null,
): string | null {
  const base = normalizeBasePath(basePath);
  if (pathname === base || pathname === `${base}/`) return landingSlug;

  const prefix = base === '/' ? base : `${base}/`;
  if (!pathname.startsWith(prefix)) return null;

  const remainder = pathname.slice(prefix.length).replace(/\/$/, '');
  return remainder && !remainder.includes('/') ? remainder : null;
}
