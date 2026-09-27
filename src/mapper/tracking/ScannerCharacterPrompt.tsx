'use client';

import { CharacterPortrait } from '@/components/character-portrait';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { mapFrostedSurface } from '../map-frosted-surface';
import { useSystemLabel } from '../windows/use-system-label';
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
  const systemName = useSystemLabel(candidate.systemId)?.name;
  return (
    <Button
      variant="secondary"
      size="sm"
      data-scanner-character-candidate={candidate.characterId}
      className="h-auto justify-start gap-2 py-1.5"
      onClick={() => onPick(candidate.characterId)}
    >
      <CharacterPortrait
        characterId={candidate.characterId}
        name={identity.name}
        src={identity.portraitUrl}
        size={28}
      />
      <span className="flex min-w-0 flex-col text-left">
        <span className="truncate text-name">{identity.name}</span>
        <span className="truncate font-data text-micro text-muted">
          {systemName ?? String(candidate.systemId)}
        </span>
      </span>
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
    <div
      data-scanner-character-prompt
      role="group"
      aria-label="Choose scanning character"
      className={cn('flex flex-col gap-2 p-3 text-ui', mapFrostedSurface)}
    >
      <span className="font-data text-label uppercase tracking-label text-muted">
        Which character scanned this?
      </span>
      <p className="font-data text-micro text-name">
        Your tracked characters are in different systems. Your pick becomes
        the default scanner; change it under Tracking in the map menu.
      </p>
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
    </div>
  );
}
