import { ActionForm } from '@/components/ui/action-form';

export function UnlinkCharacterForm({
  characterId,
  disabled,
}: {
  characterId: number;
  disabled?: boolean;
}) {
  return (
    <ActionForm
      action="/api/account/characters/unlink"
      fields={{ characterId }}
      disabled={disabled}
      disabledReason="You can't unlink your only character."
      className="whitespace-nowrap"
    >
      Unlink
    </ActionForm>
  );
}
