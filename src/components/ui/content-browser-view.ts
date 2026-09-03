/**
 * One caller-supplied content nav item; its value is the stable control key and its label or
 * marker is presentation-ready.
 */
export type ContentNavItem = {
  slug: string;
  title: string;
};

/**
 * Display-ready content nav model consumed by the shared visualization layer; callers keep all
 * numeric values in one consistent unit.
 */
export type ContentNavModel = {
  items: ContentNavItem[];
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
  return model.items[0]?.slug ?? null;
}

/**
 * Resolves the display title for one content slug, or null when the active route is not present in
 * the navigation model.
 */
export function titleForSlug(model: ContentNavModel, slug: string | null): string | null {
  if (slug === null) return null;
  return model.items.find((item) => item.slug === slug)?.title ?? null;
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
