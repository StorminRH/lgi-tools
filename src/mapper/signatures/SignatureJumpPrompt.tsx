'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { mapFrostedSurface } from '../map-frosted-surface';
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
    <div
      data-signature-jump-prompt
      className={cn(
        'flex flex-col gap-2 rounded-card p-3 text-ui',
        mapFrostedSurface,
      )}
    >
      <p className="font-data text-micro text-name">
        You jumped into{' '}
        <span
          data-identity-readout
          className={resolution.destination.tone}
        >
          {resolution.destination.label}
        </span>{' '}
        — Which signature did you jump through?
      </p>
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
    </div>
  );
}
