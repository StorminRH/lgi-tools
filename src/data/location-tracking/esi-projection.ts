// Boundary schemas + projection for character location and ship reads
// (4.0.4.2.1). GET /characters/{id}/location and GET /characters/{id}/ship —
// ESI is an external API, so bodies are Zod-validated before anything is
// written to Convex. Runtime-light by design — zod only — because the Convex
// action (convex/characterLocationSync.ts) imports this module and runs on the
// default Convex runtime.
import { z } from 'zod';

const locationBodySchema = z.object({
  solar_system_id: z.number().int(),
  station_id: z.number().int().optional(),
  structure_id: z.number().int().optional(),
});

const shipBodySchema = z.object({
  ship_type_id: z.number().int(),
});

/** Parsed location body the sync action stores. */
export interface LocationBody {
  solarSystemId: number;
  stationId: number | null;
  structureId: number | null;
}

/**
 * Returns null on a shape mismatch — the syncing action records a contract
 * error for that character rather than retrying or crashing the whole run.
 */
export function parseLocationBody(body: unknown): LocationBody | null {
  const parsed = locationBodySchema.safeParse(body);
  if (!parsed.success) return null;
  return {
    solarSystemId: parsed.data.solar_system_id,
    stationId: parsed.data.station_id ?? null,
    structureId: parsed.data.structure_id ?? null,
  };
}

/**
 * Returns null on a shape mismatch — same contract-error taxonomy as location.
 * Only `ship_type_id` is stored; item id and name have no consumer here.
 */
export function parseShipBody(body: unknown): number | null {
  const parsed = shipBodySchema.safeParse(body);
  return parsed.success ? parsed.data.ship_type_id : null;
}

/**
 * The character online endpoint — the location sync's pause/resume probe.
 * `online` is the only stored field (zod drops the login-history keys), and a
 * shape mismatch is null — the same contract-error taxonomy as the location
 * and ship reads. Owned here, not imported from the online-status slice: data
 * slices never import peers, and that slice retires with the portrait dot.
 */
export function parseOnlineBody(body: unknown): boolean | null {
  const parsed = z.object({ online: z.boolean() }).safeParse(body);
  return parsed.success ? parsed.data.online : null;
}
