import { z } from 'zod';
import type { WhStaticsEntry } from './types';

/**
 * Thrown when a system lists a wormhole code absent from the payload's
 * `wormholes` map. Silent dropping is forbidden.
 */
export class UnresolvableStaticsCodeError extends Error {
  /** The system id that listed the missing code. */
  readonly systemId: number;
  /** The wormhole code that could not be resolved. */
  readonly code: string;

  constructor(systemId: number, code: string) {
    super(
      `wh-statics: system ${systemId} lists code ${code} absent from wormholes map`,
    );
    this.name = 'UnresolvableStaticsCodeError';
    this.systemId = systemId;
    this.code = code;
  }
}

/** Normalized feed after boundary validation: version plus sorted entries. */
export type ParsedStaticsFeed = {
  feedVersion: string;
  entries: WhStaticsEntry[];
};

// Boundary schema for anoik.is static.json. Consumed fields only: version,
// systems[].solarSystemID / statics / name-or-key, and wormholes as a presence
// map. The feed's own `wormholes[code].static` boolean is NOT a validity signal
// — eight codes that systems genuinely list carry `static: false`.
const systemEntrySchema = z
  .object({
    solarSystemID: z.number().int(),
    statics: z.array(z.string()),
  })
  .passthrough();

const staticsPayloadSchema = z.object({
  version: z.union([z.number(), z.string()]),
  systems: z.record(z.string(), systemEntrySchema),
  wormholes: z.record(z.string(), z.unknown()),
});

/**
 * Pure boundary validation and normalization of an anoik.is statics body.
 * Returns system-id-then-code sorted entries. Throws
 * `UnresolvableStaticsCodeError` when a system lists a code absent from the
 * `wormholes` map. Ignores `wormholes[code].static`, `cels`, `effects`, and
 * `effectName`.
 */
export function parseStaticsPayload(body: string): ParsedStaticsFeed {
  let json: unknown;
  try {
    json = JSON.parse(body) as unknown;
  } catch {
    throw new Error('wh-statics: feed body is not valid JSON');
  }
  const result = staticsPayloadSchema.safeParse(json);
  if (!result.success) {
    throw new Error('wh-statics: feed body failed boundary validation');
  }

  const { version, systems, wormholes } = result.data;
  const entries: WhStaticsEntry[] = [];

  for (const [systemName, system] of Object.entries(systems)) {
    for (const code of system.statics) {
      if (!(code in wormholes)) {
        throw new UnresolvableStaticsCodeError(system.solarSystemID, code);
      }
      entries.push({
        systemId: system.solarSystemID,
        systemName,
        code,
      });
    }
  }

  entries.sort((a, b) => {
    if (a.systemId !== b.systemId) return a.systemId - b.systemId;
    return a.code.localeCompare(b.code);
  });

  return {
    feedVersion: String(version),
    entries,
  };
}
