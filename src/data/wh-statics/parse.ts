import { z } from 'zod';
import type { WhStaticEntry } from './schema';

const systemSchema = z.object({
  solarSystemID: z.number().int().positive(),
  solarSystemName: z.string().min(1),
  statics: z.array(z.string().min(1)),
});

const wormholeSchema = z.object({
  static: z.boolean(),
});

const staticsPayloadSchema = z.object({
  version: z.union([z.string(), z.number()]),
  systems: z.record(z.string(), systemSchema),
  wormholes: z.record(z.string(), wormholeSchema),
});

/** Validated and deterministically ordered community-feed data. */
export interface ParsedStaticsFeed {
  readonly feedVersion: string;
  readonly entries: readonly WhStaticEntry[];
}

/** Boundary failure raised when a system names no matching wormhole definition. */
export class UnknownStaticCodeError extends Error {
  /** Creates a failure that retains both the offending system and code. */
  constructor(systemName: string, code: string) {
    super(`System ${systemName} lists unknown wormhole code ${code}`);
    this.name = 'UnknownStaticCodeError';
  }
}

/**
 * Validates the publisher payload and returns only normalized per-system statics,
 * sorted by system id and code. Publisher-only celestial and effect fields are discarded.
 */
export function parseStaticsPayload(body: string): ParsedStaticsFeed {
  const parsed = staticsPayloadSchema.parse(JSON.parse(body));
  const entries: WhStaticEntry[] = [];
  for (const system of Object.values(parsed.systems)) {
    for (const code of system.statics) {
      if (!(code in parsed.wormholes)) {
        throw new UnknownStaticCodeError(system.solarSystemName, code);
      }
      entries.push({
        systemId: system.solarSystemID,
        systemName: system.solarSystemName,
        code,
      });
    }
  }
  entries.sort(
    (left, right) =>
      left.systemId - right.systemId || left.code.localeCompare(right.code),
  );
  return { feedVersion: String(parsed.version), entries };
}
