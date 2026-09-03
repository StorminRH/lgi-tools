'use client';

import { useId } from 'react';
import { Button } from '@/components/ui/button';

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
