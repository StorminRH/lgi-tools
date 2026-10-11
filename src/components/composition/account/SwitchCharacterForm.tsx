import { ActionForm } from '@/components/ui/action-form';

export function SwitchCharacterForm({ characterId }: { characterId: number }) {
  return (
    <ActionForm action="/api/account/active-character" fields={{ characterId }} className="whitespace-nowrap">
      Make active
    </ActionForm>
  );
}
