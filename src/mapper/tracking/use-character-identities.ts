'use client';

import { useAccountCharacters } from '@/components/use-account-characters';
import { useEntityNames } from '@/components/use-entity-names';

export interface CharacterIdentity {
  readonly name: string;
  readonly portraitUrl: string | undefined;
}

/** Names and portraits for the caller's characters, by id. */
export function useCharacterIdentities(
  characterIds: readonly number[],
): (characterId: number) => CharacterIdentity {
  const roster = useAccountCharacters();
  const unlisted = characterIds.filter(
    (id) => roster !== null && !roster.some((row) => row.characterId === id),
  );
  const names = useEntityNames(unlisted);
  return (characterId) => {
    const row = roster?.find((candidate) => candidate.characterId === characterId);
    return {
      name: row?.name ?? names[String(characterId)] ?? `Character ${characterId}`,
      portraitUrl: row?.portraitUrl,
    };
  };
}
