const FIRST_PUBLIC_SITE_ID = 1;
const LAST_PUBLIC_SITE_ID = 69;

/**
 * Reports whether a parsed numeric id belongs to the deploy-static public
 * wormhole-site catalogue. Publishing another canonical id requires extending
 * this closed interval alongside the catalogue data migration.
 */
export function isPublishedWormholeSiteId(id: number): boolean {
  return id >= FIRST_PUBLIC_SITE_ID && id <= LAST_PUBLIC_SITE_ID;
}
