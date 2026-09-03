'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { MAP_SCANNER_PROMPT_RAIL_CLASS } from '../windows/MapWindow';
import { mapFrostedSurface } from '../map-frosted-surface';
import { SignatureJumpPrompt } from './SignatureJumpPrompt';
import type {
  JumpResolutionCandidate,
  JumpResolutionModel,
} from './jump-resolution';

function missingPromptCopy(count: number): string {
  return count === 1
    ? '1 signature missing from scan'
    : `${count} signatures missing from scan`;
}

function MissingSignaturesPrompt({
  count,
  canEdit,
  onDismiss,
  onRemove,
}: {
  readonly count: number;
  readonly canEdit: boolean;
  readonly onDismiss: () => void;
  readonly onRemove: () => void;
}) {
  if (count === 0) return null;
  return (
    <div
      data-signature-missing-prompt
      className={cn(
        'flex flex-col gap-2 rounded-card p-3 text-ui',
        mapFrostedSurface,
      )}
    >
      <span className="font-data text-label uppercase tracking-label text-muted">
        Missing from scan
      </span>
      <p className="font-data text-micro text-name">{missingPromptCopy(count)}</p>
      <div className="flex justify-end gap-1">
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          Dismiss
        </Button>
        {canEdit ? (
          <Button variant="danger" size="sm" onClick={onRemove}>
            Remove
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function ScannerPromptRail({
  missingCount,
  canEdit,
  onDismissMissing,
  onRemoveMissing,
  jumpResolution,
  onPickJumpCandidate,
}: {
  readonly missingCount: number;
  readonly canEdit: boolean;
  readonly onDismissMissing: () => void;
  readonly onRemoveMissing: () => void;
  readonly jumpResolution: JumpResolutionModel | null;
  readonly onPickJumpCandidate: (candidate: JumpResolutionCandidate) => void;
}) {
  if (missingCount === 0 && !(canEdit && jumpResolution !== null)) return null;
  return (
    <div
      data-scanner-prompt-rail
      className={MAP_SCANNER_PROMPT_RAIL_CLASS}
    >
      <MissingSignaturesPrompt
        count={missingCount}
        canEdit={canEdit}
        onDismiss={onDismissMissing}
        onRemove={onRemoveMissing}
      />
      {canEdit && jumpResolution !== null ? (
        <SignatureJumpPrompt
          resolution={jumpResolution}
          onPick={onPickJumpCandidate}
        />
      ) : null}
    </div>
  );
}
