import { ConfirmActionForm } from '@/components/ui/confirm-action-form';

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
    <ConfirmActionForm
      action="/api/admin/characters/reassign"
      fields={{ characterId, fromUserId }}
      confirm={`Move ${characterName} (ID ${characterId}) onto your account? If this leaves the source account empty, it will be removed.`}
      className="text-isk whitespace-nowrap"
    >
      Reassign to me
    </ConfirmActionForm>
  );
}
