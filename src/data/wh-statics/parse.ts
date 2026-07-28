import { z } from 'zod';

const systemSchema = z.object({
  solarSystemID: z.number().int().positive(),
  solarSystemName: z.string().min(1),
  statics: z.array(z.string().min(1)),
});

const staticsPayloadSchema = z.object({
  version: z.union([z.string(), z.number()]).transform(String),
  wormholes: z.record(z.string(), z.unknown()),
  systems: z.record(z.string(), systemSchema),
});

/** One normalized per-system static assignment from the community feed. */
export interface ParsedStaticsEntry {
  readonly systemId: number;
  readonly systemName: string;
  readonly code: string;
}

/** Validated and deterministically ordered statics-feed content. */
export interface ParsedStaticsFeed {
  readonly feedVersion: string;
  readonly entries: readonly ParsedStaticsEntry[];
}

/** Boundary failure raised when a system references no matching wormhole record. */
export class UnknownStaticsWormholeCodeError extends Error {
  /** Builds the named boundary error with the offending system and code. */
  constructor(systemName: string, code: string) {
    super(`anoik.is system ${systemName} references unknown wormhole code ${code}`);
    this.name = 'UnknownStaticsWormholeCodeError';
  }
}

/**
 * Validates and normalizes the community statics payload, intentionally ignoring
 * celestials, effects, and the feed's unreliable wormhole `static` flag.
 */
export function parseStaticsPayload(body: string): ParsedStaticsFeed {
  const payload = staticsPayloadSchema.parse(JSON.parse(body));
  const entries = Object.values(payload.systems).flatMap((system) =>
    system.statics.map((code) => {
      if (payload.wormholes[code] === undefined) {
        throw new UnknownStaticsWormholeCodeError(
          system.solarSystemName,
          code,
        );
      }
      return {
        systemId: system.solarSystemID,
        systemName: system.solarSystemName,
        code,
      };
    }),
  );
  entries.sort(
    (left, right) =>
      left.systemId - right.systemId || left.code.localeCompare(right.code),
  );
  return { feedVersion: payload.version, entries };
}
