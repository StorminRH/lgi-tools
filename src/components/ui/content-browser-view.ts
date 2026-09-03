export type ContentNavItem = {
  slug: string;
  title: string;
};

export type ContentNavModel = {
  items: ContentNavItem[];
};

function normalizeBasePath(basePath: `/${string}`): `/${string}` {
  if (basePath === '/') return basePath;
  return basePath.replace(/\/+$/, '') as `/${string}`;
}

export function landingContentSlug(model: ContentNavModel): string | null {
  return model.items[0]?.slug ?? null;
}

export function titleForSlug(model: ContentNavModel, slug: string | null): string | null {
  if (slug === null) return null;
  return model.items.find((item) => item.slug === slug)?.title ?? null;
}

export function contentBrowserHref(
  basePath: `/${string}`,
  slug: string,
  landingSlug: string | null,
): string {
  const base = normalizeBasePath(basePath);
  if (slug === landingSlug) return base;
  return base === '/' ? `/${slug}` : `${base}/${slug}`;
}

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
