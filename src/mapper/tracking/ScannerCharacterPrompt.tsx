'use client';

import { Button } from '@/components/ui/button';
import { MapPromptCard } from '../map-prompt-card';
import { CharacterLocationLabel } from './character-location-label';
import type { DockCharacter } from './tracked-system';
import {
  useCharacterIdentities,
  type CharacterIdentity,
} from './use-character-identities';

function CandidateButton({
  candidate,
  identity,
  onPick,
}: {
  readonly candidate: DockCharacter;
  readonly identity: CharacterIdentity;
  readonly onPick: (characterId: number) => void;
}) {
  return (
    <Button
      variant="secondary"
      size="sm"
      data-scanner-character-candidate={candidate.characterId}
      className="h-auto justify-start gap-2 py-1.5"
      onClick={() => onPick(candidate.characterId)}
    >
      <CharacterLocationLabel
        characterId={candidate.characterId}
        identity={identity}
        systemId={candidate.systemId}
        sublineTone="muted"
      />
    </Button>
  );
}

/**
 * Asks which character produced a scanner paste when tracked characters are
 * in different systems. The pick becomes the default scanner.
 */
export function ScannerCharacterPrompt({
  candidates,
  onPick,
  onCancel,
}: {
  readonly candidates: readonly DockCharacter[];
  readonly onPick: (characterId: number) => void;
  readonly onCancel: () => void;
}) {
  const identityOf = useCharacterIdentities(
    candidates.map((candidate) => candidate.characterId),
  );
  return (
    <MapPromptCard
      data-scanner-character-prompt
      ariaLabel="Choose scanning character"
      eyebrow="Which character scanned this?"
      body={
        <>
          Your logged-in characters are in different systems. Your pick becomes
          the default scanner; change it under Tracking in the map menu.
        </>
      }
    >
      <div className="flex flex-col gap-1">
        {candidates.map((candidate) => (
          <CandidateButton
            key={candidate.characterId}
            candidate={candidate}
            identity={identityOf(candidate.characterId)}
            onPick={onPick}
          />
        ))}
      </div>
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </MapPromptCard>
  );
}
