export type SemanticWrite =
  | { readonly kind: 'idle' }
  | { readonly kind: 'mutated' }
  | { readonly kind: 'claimed' };

export interface PasteWriteCounts {
  readonly inserted: number;
  readonly updated: number;
  readonly migrated: number;
  readonly removedConfident: number;
}

export interface IdentifyWriteResult {
  readonly changed: boolean;
  readonly connectionId: string | null;
}

export interface TypeSetterWriteResult {
  readonly changed: boolean;
  readonly claimed: boolean;
}

export function pasteSemanticWrite(counts: PasteWriteCounts): SemanticWrite {
  const changed =
    counts.inserted + counts.updated + counts.migrated + counts.removedConfident;
  return changed > 0 ? { kind: 'mutated' } : { kind: 'idle' };
}

export function identifySemanticWrite(result: IdentifyWriteResult): SemanticWrite {
  if (result.connectionId !== null && !result.changed) return { kind: 'claimed' };
  if (result.changed) return { kind: 'mutated' };
  return { kind: 'idle' };
}

export function typeSetterSemanticWrite(result: TypeSetterWriteResult): SemanticWrite {
  if (result.changed) return { kind: 'mutated' };
  if (result.claimed) return { kind: 'claimed' };
  return { kind: 'idle' };
}

export function pasteWriteDigest(
  systemId: number,
  signatureIds: readonly string[],
): string {
  return `${systemId}:${[...signatureIds].sort().join(',')}`;
}

export function identifyWriteDigest(
  systemId: number,
  signatureId: string,
  group: string,
): string {
  return `${systemId}:${signatureId}:${group}`;
}

export function eliminationFollowUpNeeded(
  write: SemanticWrite,
  lastDigest: string | undefined,
  digest: string,
): boolean {
  if (write.kind !== 'idle') return true;
  return lastDigest !== digest;
}
