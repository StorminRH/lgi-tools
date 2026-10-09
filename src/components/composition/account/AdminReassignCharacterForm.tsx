'use client';

import { Button } from '@/components/ui/button';

/** Offered only for characters on another account: the page leaves it out for the viewing admin's own. */
export function AdminReassignCharacterForm({
  characterId,
  characterName,
  fromUserId,
}: {
  characterId: number;
  characterName: string;
  fromUserId: string;
}) {
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
      <Button type="submit" variant="secondary" size="sm" className="text-isk whitespace-nowrap">
        Reassign to me
      </Button>
    </form>
  );
}
