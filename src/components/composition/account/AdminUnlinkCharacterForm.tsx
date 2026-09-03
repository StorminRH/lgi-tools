'use client';

import { Button } from '@/components/ui/button';

export function AdminUnlinkCharacterForm({
  userId,
  characterId,
  characterName,
  disabled,
}: {
  userId: string;
  characterId: number;
  characterName: string;
  disabled?: boolean;
}) {
  return (
    <form
      method="POST"
      action="/api/admin/characters/unlink"
      onSubmit={(e) => {
        if (!window.confirm(`Force-unlink ${characterName} (ID ${characterId}) from this account?`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="characterId" value={characterId} />
      <Button
        type="submit"
        variant="secondary"
        size="sm"
        disabled={disabled}
        title={disabled ? "Can't unlink the user's only character — reassign it instead" : undefined}
        className="whitespace-nowrap"
      >
        Unlink
      </Button>
    </form>
  );
}
