'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { mapFrostedSurface } from '../map-frosted-surface';
import {
  jumpCandidateLabel,
  type JumpResolutionModel,
} from './jump-resolution';

/** Confirm/correct dispatchers for one pending auto-link resolution. */
export interface JumpResolutionAnswers {
  readonly onConfirm: () => void;
  readonly onCorrect: (targetConnectionId: string) => void;
}

/**
 * The confirm/correct button set, shared by the floating prompt and the
 * connection card's pending-resolution group so a dismissed prompt stays
 * answerable later.
 */
export function JumpResolutionChoices({
  resolution,
  answers,
}: {
  readonly resolution: JumpResolutionModel;
  readonly answers: JumpResolutionAnswers;
}) {
  const alternatives = resolution.candidates.filter(
    (candidate) => !candidate.isCurrent,
  );
  return (
    <div className="flex w-full flex-col gap-1">
      <Button
        variant="primary"
        size="sm"
        data-map-jump-confirm
        onClick={answers.onConfirm}
      >
        Confirm
      </Button>
      {alternatives.map((candidate) => (
        <Button
          key={candidate.connectionId}
          variant="secondary"
          size="sm"
          data-map-jump-correct={candidate.connectionId}
          onClick={() => answers.onCorrect(candidate.connectionId)}
        >
          Use {jumpCandidateLabel(candidate)}
        </Button>
      ))}
    </div>
  );
}

/** Props for the floating non-blocking confirm/correct prompt. */
export interface JumpResolutionPromptProps {
  readonly resolution: JumpResolutionModel;
  readonly answers: JumpResolutionAnswers;
  readonly onDismiss: () => void;
}

/**
 * Bottom-right non-blocking prompt for the newest assumed auto-link. Dismissal
 * is client-local: the association stands and the connection card keeps the
 * same choices available.
 */
export function JumpResolutionPrompt({
  resolution,
  answers,
  onDismiss,
}: JumpResolutionPromptProps) {
  const current =
    resolution.candidates.find((candidate) => candidate.isCurrent) ?? null;
  return (
    <div
      data-map-jump-prompt
      // bottom-16 clears the fixed bottom-right feedback button (z-dropdown
      // beats z-sticky, so overlap would cover Dismiss).
      className="pointer-events-none absolute bottom-16 right-4 z-sticky flex justify-end"
    >
      <div
        className={cn(
          'pointer-events-auto flex w-64 flex-col gap-2 rounded-card p-3 text-ui',
          mapFrostedSurface,
        )}
      >
        <span className="text-label uppercase tracking-label text-muted">
          Auto-linked signature
        </span>
        {current !== null ? (
          <span
            data-map-jump-prompt-current
            className="font-data text-micro text-name"
          >
            {jumpCandidateLabel(current)}
          </span>
        ) : null}
        <JumpResolutionChoices resolution={resolution} answers={answers} />
        <Button
          variant="ghost"
          size="sm"
          data-map-jump-dismiss
          onClick={onDismiss}
        >
          Dismiss
        </Button>
      </div>
    </div>
  );
}
