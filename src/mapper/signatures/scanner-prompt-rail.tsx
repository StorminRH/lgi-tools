'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { formatCount } from '@/lib/format/number';
import { MAP_SCANNER_PROMPT_RAIL_CLASS } from '../windows/MapWindow';
import { mapFrostedSurface } from '../map-frosted-surface';
import { ScannerCharacterPrompt } from '../tracking/ScannerCharacterPrompt';
import { SignatureJumpPrompt } from './SignatureJumpPrompt';
import type {
  JumpResolutionCandidate,
  JumpResolutionModel,
} from './jump-resolution';
import type { PendingScannerPaste } from './use-scanner-paste';

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
        'flex flex-col gap-2 p-3 text-ui',
        mapFrostedSurface,
      )}
    >
      <span className="font-data text-label uppercase tracking-label text-muted">
        Missing from scan
      </span>
      <p className="font-data text-micro text-name">
        {`${formatCount(count, 'signature')} missing from scan`}
      </p>
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
  pendingPaste,
  onChooseScanner,
  onCancelPendingPaste,
}: {
  readonly missingCount: number;
  readonly canEdit: boolean;
  readonly onDismissMissing: () => void;
  readonly onRemoveMissing: () => void;
  readonly jumpResolution: JumpResolutionModel | null;
  readonly onPickJumpCandidate: (candidate: JumpResolutionCandidate) => void;
  readonly pendingPaste: PendingScannerPaste | null;
  readonly onChooseScanner: (characterId: number) => void;
  readonly onCancelPendingPaste: () => void;
}) {
  if (
    missingCount === 0 &&
    pendingPaste === null &&
    !(canEdit && jumpResolution !== null)
  ) {
    return null;
  }
  return (
    <div
      data-scanner-prompt-rail
      className={MAP_SCANNER_PROMPT_RAIL_CLASS}
    >
      {pendingPaste === null ? null : (
        <ScannerCharacterPrompt
          candidates={pendingPaste.candidates}
          onPick={onChooseScanner}
          onCancel={onCancelPendingPaste}
        />
      )}
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
