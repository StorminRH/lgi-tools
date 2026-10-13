'use client';

import { Button } from '@/components/ui/button';
import { MapPromptCard } from '../map-prompt-card';
import {
  jumpCandidateLabel,
  type JumpResolutionCandidate,
  type JumpResolutionModel,
} from './jump-resolution';

export interface SignatureJumpPromptProps {
  readonly resolution: JumpResolutionModel;
  readonly onPick: (candidate: JumpResolutionCandidate) => void;
}

export function SignatureJumpPrompt({
  resolution,
  onPick,
}: SignatureJumpPromptProps) {
  return (
    <MapPromptCard
      data-signature-jump-prompt
      ariaLabel="Choose the wormhole you took"
      body={
        <>
          You jumped into{' '}
          <span
            data-identity-readout
            className={resolution.destination.tone}
          >
            {resolution.destination.label}
          </span>
          . Which wormhole did you take?
        </>
      }
    >
      <div className="flex flex-col gap-1">
        {resolution.candidates.map((candidate) => (
          <Button
            key={candidate.connectionId}
            variant="secondary"
            size="sm"
            data-signature-jump-candidate={candidate.connectionId}
            onClick={() => onPick(candidate)}
          >
            {jumpCandidateLabel(candidate)}
          </Button>
        ))}
      </div>
    </MapPromptCard>
  );
}
