import { ConfirmActionForm } from '@/components/ui/confirm-action-form';

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
    <ConfirmActionForm
      action="/api/admin/characters/unlink"
      fields={{ userId, characterId }}
      confirm={`Force-unlink ${characterName} (ID ${characterId}) from this account?`}
      disabled={disabled}
      disabledReason="Can't unlink the user's only character — reassign it instead."
      className="whitespace-nowrap"
    >
      Unlink
    </ConfirmActionForm>
  );
}
