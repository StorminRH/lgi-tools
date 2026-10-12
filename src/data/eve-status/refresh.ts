import {
  commit,
  fetchStored,
  noteStatusOutcome,
  serverErrorMeta,
  storedRow,
  STATUS_KEY,
  type EsiResponseMeta,
} from '@/data/esi-store';
import { eveTag } from '@/lib/esi-datasets/routes';
import { EsiServerError } from '@/platform/esi';
import { parseServerStatus } from './parse';
import { statusRecordOf, type StatusRecord } from './record';
import type { ServerStatus } from './types';

const STATUS_TAG = eveTag('eve_status');
/** ESI's answers while Tranquility is down; nothing else counts toward the downtime halt. */
const DOWN_STATUSES = new Set([503, 504]);
const OFFLINE: ServerStatus = { state: 'offline' };

type Answer =
  | { readonly kind: 'unchanged' }
  | { readonly kind: 'answered'; readonly status: ServerStatus; readonly meta: EsiResponseMeta }
  | { readonly kind: 'down'; readonly meta: EsiResponseMeta }
  | { readonly kind: 'failed' };

/**
 * One status read through the store, with no retries: a 503 or 504 is an
 * answer (Tranquility is down) and a 4xx, timeout, budget refusal or
 * malformed body says nothing about the server.
 */
async function askEsi(checkedAt: number): Promise<Answer> {
  try {
    const result = await fetchStored(STATUS_KEY);
    if (result.kind === 'unchanged') return { kind: 'unchanged' };
    if (result.kind === 'error') return { kind: 'failed' };
    return { kind: 'answered', status: parseServerStatus(result.meta.body), meta: result.meta };
  } catch (error) {
    if (error instanceof EsiServerError && DOWN_STATUSES.has(error.status)) {
      return { kind: 'down', meta: serverErrorMeta(STATUS_KEY, error, checkedAt) };
    }
    return { kind: 'failed' };
  }
}

/** The row to write for an answer: the new document with the halt moved on, under the answer's expiry. */
function answeredRecord(answer: Exclude<Answer, { kind: 'unchanged' | 'failed' }>, held: StatusRecord, checkedAt: number): EsiResponseMeta {
  const status = answer.kind === 'answered' ? answer.status : OFFLINE;
  const record: StatusRecord = { status, halt: noteStatusOutcome(held.halt, answer.kind, checkedAt) };
  return { ...answer.meta, body: record };
}

/**
 * Refreshes the stored server status once it is due. A 200 stores the
 * status, a 503 stores Tranquility offline until ESI's own expiry, and
 * either moves the downtime halt on. Any other failure records nothing,
 * so the next view asks again; it only clears a failure streak it breaks.
 */
export async function refreshServerStatusOnView(): Promise<void> {
  const checkedAt = Date.now();
  const answer = await askEsi(checkedAt);
  if (answer.kind === 'unchanged') return;
  const row = await storedRow(STATUS_KEY);
  const held = statusRecordOf(row?.body);
  if (answer.kind !== 'failed') {
    await commit([answeredRecord(answer, held, checkedAt)], { tag: STATUS_TAG });
    return;
  }
  if (row === null || held.halt.failures.length === 0) return;
  const record: StatusRecord = { status: held.status, halt: noteStatusOutcome(held.halt, 'failed', checkedAt) };
  await commit([{ key: STATUS_KEY, ...row, body: record }], { tag: STATUS_TAG });
}
