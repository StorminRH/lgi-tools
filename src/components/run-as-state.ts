import type { AccountCharactersResponse } from '@/platform/auth/api-contract';
import type { Session } from '@/platform/auth/types';

export type BuildCharacter = AccountCharactersResponse['characters'][number];

export function resolveBuildCharacter(
  selectedId: number | null,
  roster: BuildCharacter[] | null,
): { character: BuildCharacter | null; pending: boolean } {
  if (selectedId === null) return { character: null, pending: false };
  if (roster === null) return { character: null, pending: true };
  return {
    character: roster.find((c) => c.characterId === selectedId) ?? null,
    pending: false,
  };
}

export function deriveRoster(
  state: { loading: boolean; characterId: number | null },
  fetched: { characterId: number; list: BuildCharacter[] } | null,
): BuildCharacter[] | null {
  if (state.loading) return null;
  if (state.characterId === null) return [];
  return fetched && fetched.characterId === state.characterId ? fetched.list : null;
}

export type RunAsView =
  | { kind: 'loading' }
  | { kind: 'anon' }
  | { kind: 'present'; characterId: number; name: string; portraitUrl: string };

export function runAsView(
  state: { session: Session | null; loading: boolean },
  selection?: { character: BuildCharacter | null; pending: boolean },
): RunAsView {
  if (state.loading) return { kind: 'loading' };
  if (state.session === null) return { kind: 'anon' };
  if (selection?.pending) return { kind: 'loading' };
  if (selection?.character) {
    const { characterId, name, portraitUrl } = selection.character;
    return { kind: 'present', characterId, name, portraitUrl };
  }
  const { characterId, name, portraitUrl } = state.session;
  return { kind: 'present', characterId, name, portraitUrl };
}

export function buildRadioValue(buildCharacter: BuildCharacter | null): number {
  return buildCharacter?.characterId ?? 0;
}

export function parseRadioSelection(value: number): number | null {
  return value === 0 ? null : value;
}
