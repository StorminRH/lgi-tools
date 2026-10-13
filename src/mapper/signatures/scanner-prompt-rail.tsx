'use client';

import { Button } from '@/components/ui/button';
import { formatCount } from '@/lib/format/number';
import { MAP_SCANNER_PROMPT_RAIL_CLASS } from '../windows/MapWindow';
import { MapPromptCard } from '../map-prompt-card';
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
    <MapPromptCard
      data-signature-missing-prompt
      ariaLabel="Missing signatures"
      eyebrow="Missing from scan"
      body={`${formatCount(count, 'signature')} missing from scan`}
    >
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
    </MapPromptCard>
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
