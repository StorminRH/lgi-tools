const FIRST_PUBLIC_SITE_ID = 1;
const LAST_PUBLIC_SITE_ID = 69;

export function isPublishedWormholeSiteId(id: number): boolean {
  return id >= FIRST_PUBLIC_SITE_ID && id <= LAST_PUBLIC_SITE_ID;
}
