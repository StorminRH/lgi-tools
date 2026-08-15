/** Basic despawn-ledger event kinds; future history kinds extend this owner. */
export const MAP_EVENT_KINDS = [
  'connection_severed_retained',
  'branch_removed',
  'branch_restored',
  'connection_restored',
  'signatures_removed',
  'signatures_restored',
] as const;

/** One basic despawn-ledger event kind. */
export type MapEventKind = (typeof MAP_EVENT_KINDS)[number];

/** Event payloads keyed by their single authoritative kind vocabulary. */
export interface MapEventPayloadByKind {
  readonly connection_severed_retained: { readonly connectionId: string };
  readonly branch_removed: {
    readonly connectionId: string;
    readonly systemIds: readonly number[];
  };
  readonly branch_restored: {
    readonly connectionId: string;
    readonly systemIds: readonly number[];
  };
  readonly connection_restored: { readonly connectionId: string };
  readonly signatures_removed: {
    readonly systemId: number;
    readonly signatureIds: readonly string[];
  };
  readonly signatures_restored: {
    readonly systemId: number;
    readonly signatureIds: readonly string[];
  };
}

/** Seven-day retention for the shared basic map-event ledger. */
export const MAP_EVENT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
