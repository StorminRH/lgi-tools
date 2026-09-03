import { z } from 'zod';
import type { WhStaticEntry } from './schema';

const systemSchema = z.object({
  solarSystemID: z.number().int().positive(),
  solarSystemName: z.string().min(1),
  statics: z
    .array(z.string().min(1))
    .refine(
      (codes) => new Set(codes).size === codes.length,
      'System statics must be unique',
    ),
});

const wormholeSchema = z.object({
  static: z.boolean().nullable(),
});

const staticsPayloadSchema = z.object({
  version: z.union([z.string(), z.number()]),
  systems: z.record(z.string(), systemSchema),
  wormholes: z.record(z.string(), wormholeSchema),
});

export interface ParsedStaticsFeed {
  readonly feedVersion: string;
  readonly entries: readonly WhStaticEntry[];
}

export class UnknownStaticCodeError extends Error {

  constructor(systemName: string, code: string) {
    super(`System ${systemName} lists unknown wormhole code ${code}`);
    this.name = 'UnknownStaticCodeError';
  }
}

export function parseStaticsPayload(body: string): ParsedStaticsFeed {
  const parsed = staticsPayloadSchema.parse(JSON.parse(body));
  const entries: WhStaticEntry[] = [];
  for (const system of Object.values(parsed.systems)) {
    for (const code of system.statics) {
      if (!Object.hasOwn(parsed.wormholes, code)) {
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
