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
