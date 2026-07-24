'use client';

import { useId } from 'react';
import { Button } from '@/components/ui/button';

/**
 * Admin reassign control — moves a character onto the acting admin's own account
 * (the destination is fixed server-side to the caller). Pure HTML form with a
 * confirm() gate (bundled client JS — CSP-safe). `disabled` is set when viewing
 * your own account, where a move would be a no-op.
 */
export function AdminReassignCharacterForm({
  characterId,
  characterName,
  fromUserId,
  disabled,
}: {
  characterId: number;
  characterName: string;
  fromUserId: string;
  disabled?: boolean;
}) {
  const disabledReasonId = useId();

  return (
    <form
      method="POST"
      action="/api/admin/characters/reassign"
      onSubmit={(e) => {
        if (
          !window.confirm(
            `Move ${characterName} (ID ${characterId}) onto your account? If this leaves the source account empty, it will be removed.`,
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="characterId" value={characterId} />
      <input type="hidden" name="fromUserId" value={fromUserId} />
      <Button
        type="submit"
        variant="secondary"
        size="sm"
        disabled={disabled}
        aria-describedby={disabled ? disabledReasonId : undefined}
        title={disabled ? 'This character is already on your account' : undefined}
        className="text-isk whitespace-nowrap"
      >
        Reassign to me
      </Button>
      <span id={disabledReasonId} className="sr-only">
        This character is already on your account.
      </span>
    </form>
  );
}
