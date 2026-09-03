import { z } from 'zod';

const locationBodySchema = z.object({
  solar_system_id: z.number().int(),
  station_id: z.number().int().optional(),
  structure_id: z.number().int().optional(),
});

const shipBodySchema = z.object({
  ship_type_id: z.number().int(),
});

export interface LocationBody {
  solarSystemId: number;
  stationId: number | null;
  structureId: number | null;
}

export function parseLocationBody(body: unknown): LocationBody | null {
  const parsed = locationBodySchema.safeParse(body);
  if (!parsed.success) return null;
  return {
    solarSystemId: parsed.data.solar_system_id,
    stationId: parsed.data.station_id ?? null,
    structureId: parsed.data.structure_id ?? null,
  };
}

export function parseShipBody(body: unknown): number | null {
  const parsed = shipBodySchema.safeParse(body);
  return parsed.success ? parsed.data.ship_type_id : null;
}

export function parseOnlineBody(body: unknown): boolean | null {
  const parsed = z.object({ online: z.boolean() }).safeParse(body);
  return parsed.success ? parsed.data.online : null;
}
