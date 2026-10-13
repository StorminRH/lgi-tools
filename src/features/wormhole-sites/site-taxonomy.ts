export const SITE_TYPES = ['combat', 'gas', 'ore', 'relic', 'data'] as const;
export type SiteType = typeof SITE_TYPES[number];

export const WORMHOLE_CLASSES = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6'] as const;
export type WormholeClass = typeof WORMHOLE_CLASSES[number];
