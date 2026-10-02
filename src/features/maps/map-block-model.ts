import type { MapBlockOption } from '@/data/maps/access-contract';
import type { AccessPrincipalOption } from './access-editor-model';

export function mapBlockRevision(blocks: readonly MapBlockOption[]): string {
  return blocks.map((block) => `${block.characterId}:${block.name}`).toSorted().join(',');
}

export function withBlock(
  blocks: readonly MapBlockOption[],
  block: MapBlockOption,
): MapBlockOption[] {
  return blocks.some((held) => held.characterId === block.characterId)
    ? [...blocks]
    : [...blocks, block];
}

export function withoutBlock(
  blocks: readonly MapBlockOption[],
  characterId: number,
): MapBlockOption[] {
  return blocks.filter((block) => block.characterId !== characterId);
}

/** Blocked characters as search selections, so search hides them. */
export function blockedPrincipals(
  blocks: readonly MapBlockOption[],
): Pick<AccessPrincipalOption, 'ownerType' | 'ownerId'>[] {
  return blocks.map((block) => ({ ownerType: 'character', ownerId: block.characterId }));
}
