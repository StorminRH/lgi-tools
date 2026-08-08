import type { ScannedKind, ScannedRow } from './scan-parse';

/** Existing signature identity needed to grade one complete-kind scan. */
export interface SignatureLifecycleRow {
  readonly signatureId: string;
  readonly kind?: ScannedKind;
  readonly deathLatestAt?: number | null;
}

/** Pre-additive rows without a stored kind belong to the Signatures tab. */
export function signatureKind(row: SignatureLifecycleRow): ScannedKind {
  return row.kind ?? 'signature';
}

/**
 * Returns live rows absent from a paste, scoped only to kinds represented in
 * that paste. A filtered paste therefore says nothing about the omitted kind.
 */
export function findMissingSignatures<Row extends SignatureLifecycleRow>(
  existing: readonly Row[],
  incoming: readonly Pick<ScannedRow, 'signatureId' | 'kind'>[],
): Row[] {
  const representedKinds = new Set(incoming.map((row) => row.kind));
  const observedIds = new Set(incoming.map((row) => row.signatureId));
  return existing.filter(
    (row) => representedKinds.has(signatureKind(row)) && !observedIds.has(row.signatureId),
  );
}

/** Missing plus a passed finite ceiling is strong enough for silent removal. */
export function isConfidentMissingRemoval(
  row: SignatureLifecycleRow,
  now: number,
): boolean {
  return typeof row.deathLatestAt === 'number'
    && Number.isFinite(row.deathLatestAt)
    && row.deathLatestAt <= now;
}
