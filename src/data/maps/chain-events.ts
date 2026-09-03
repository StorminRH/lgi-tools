export const MAP_EVENT_KINDS = [
  'connection_severed_retained',
  'branch_removed',
  'branch_restored',
  'connection_restored',
  'signatures_removed',
  'signatures_restored',
] as const;

export type MapEventKind = (typeof MAP_EVENT_KINDS)[number];

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

export const MAP_EVENT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
