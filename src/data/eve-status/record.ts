import { z } from 'zod';
import { haltOf, type DowntimeHalt } from '@/data/esi-store';
import type { ServerStatus } from './types';

/**
 * What the `/status/` row's body holds: the status as LGI shows it, beside
 * the downtime halt the response store reads. The row is a keepBody row,
 * so the document lives in esi_responses and no mirror table exists.
 */
export interface StatusRecord {
  readonly status: ServerStatus;
  readonly halt: DowntimeHalt;
}

const statusSchema: z.ZodType<ServerStatus> = z.union([
  z.object({ state: z.enum(['online', 'vip']), players: z.number(), startedAt: z.string().nullable() }),
  z.object({ state: z.literal('offline') }),
  z.object({ state: z.literal('unknown') }),
]);

const UNKNOWN: ServerStatus = { state: 'unknown' };

/** The record a stored body holds; a missing or malformed body is an unknown status with no halt. */
export function statusRecordOf(body: unknown): StatusRecord {
  const parsed = z.object({ status: statusSchema }).safeParse(body);
  return { status: parsed.success ? parsed.data.status : UNKNOWN, halt: haltOf(body) };
}
