/**
 * Catalogue headline ISK for a site row: blue-loot for wave-driven types,
 * resource sheet total otherwise. Shared by global search and the scanner
 * Est. ISK column so both surfaces read one rule.
 */
export function primarySiteIsk(entry: {
  readonly siteType: string;
  readonly blueLootIsk: number | null;
  readonly resourceValueIsk: number | null;
}): number | null {
  if (
    entry.siteType === 'combat'
    || entry.siteType === 'relic'
    || entry.siteType === 'data'
  ) {
    return entry.blueLootIsk;
  }
  return entry.resourceValueIsk;
}
