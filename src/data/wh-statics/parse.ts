import { z } from 'zod';

/** One normalized (system, static code) assignment from the anoik.is feed. */
export type StaticsEntry = {
  systemId: number;
  systemName: string;
  code: string;
};

/** Boundary-validated anoik.is statics payload ready for diff and cross-check. */
export type ParsedStaticsFeed = {
  feedVersion: string;
  entries: StaticsEntry[];
};

/**
 * Thrown when a system lists a wormhole code absent from the payload's
 * `wormholes` map. Silent dropping is forbidden.
 */
export class UnresolvableStaticsCodeError extends Error {
  readonly code: string;
  readonly systemId: number;

  constructor(code: string, systemId: number) {
    super(
      `System ${systemId} lists static code ${code} which is absent from the wormholes map`,
    );
    this.name = 'UnresolvableStaticsCodeError';
    this.code = code;
    this.systemId = systemId;
  }
}

const systemEntrySchema = z
  .object({
    solarSystemID: z.number(),
    solarSystemName: z.string(),
    statics: z.array(z.string()),
  })
  .passthrough();

const staticsPayloadSchema = z
  .object({
    version: z.union([z.number(), z.string()]),
    systems: z.record(z.string(), systemEntrySchema),
    wormholes: z.record(z.string(), z.unknown()),
  })
  .passthrough();

/**
 * Zod-validates the anoik.is statics payload at the boundary and returns a
 * system-id-then-code sorted entry list. Validates that every listed code
 * resolves in the payload's `wormholes` map; never treats
 * `wormholes[code].static` as a validity signal.
 */
export function parseStaticsPayload(body: string): ParsedStaticsFeed {
  let json: unknown;
  try {
    json = JSON.parse(body) as unknown;
  } catch {
    throw new Error('anoik.is statics payload is not valid JSON');
  }

  const parsed = staticsPayloadSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(`anoik.is statics payload failed boundary validation: ${parsed.error.message}`);
  }

  const wormholeCodes = new Set(Object.keys(parsed.data.wormholes));
  const entries: StaticsEntry[] = [];

  for (const system of Object.values(parsed.data.systems)) {
    for (const code of system.statics) {
      if (!wormholeCodes.has(code)) {
        throw new UnresolvableStaticsCodeError(code, system.solarSystemID);
      }
      entries.push({
        systemId: system.solarSystemID,
        systemName: system.solarSystemName,
        code,
      });
    }
  }

  entries.sort((a, b) => {
    if (a.systemId !== b.systemId) return a.systemId - b.systemId;
    return a.code.localeCompare(b.code);
  });

  return {
    feedVersion: String(parsed.data.version),
    entries,
  };
}
