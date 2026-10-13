import { coverageIndex, type CoveragePayload } from '../tracking/presence-model';
import {
  dockCharacters,
  resolvePasteTarget,
  type DockCharactersInput,
} from '../tracking/tracked-system';

export type HomeCurrentSystem =
  | { readonly kind: 'loading' }
  | { readonly kind: 'untracked' }
  | { readonly kind: 'offline' }
  | { readonly kind: 'ready'; readonly systemId: number };

/**
 * The system the home prompt offers as "current": the active character's when
 * it is live, else the one system every live tracked alt shares. The active
 * character stands in for the scanner preference in resolvePasteTarget.
 */
export function homeCurrentSystem(input: {
  readonly characterId: number | null;
  readonly tracking: Omit<DockCharactersInput, 'coverage'> | undefined;
  readonly coverage: CoveragePayload | undefined;
}): HomeCurrentSystem {
  if (
    input.characterId == null
    || input.tracking === undefined
    || input.coverage === undefined
  ) {
    return { kind: 'loading' };
  }
  if (input.tracking.ownTrackedCharacterIds.length === 0) {
    return { kind: 'untracked' };
  }
  const target = resolvePasteTarget(
    dockCharacters({
      ownTrackedCharacterIds: input.tracking.ownTrackedCharacterIds,
      tracked: input.tracking.tracked,
      coverage: coverageIndex(input.coverage),
    }),
    input.characterId,
  );
  return target.kind === 'ready'
    ? { kind: 'ready', systemId: target.systemId }
    : { kind: 'offline' };
}
