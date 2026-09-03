import { Button } from '@/components/ui/button';

export function SwitchCharacterForm({ characterId }: { characterId: number }) {
  return (
    <form method="POST" action="/api/account/active-character">
      <input type="hidden" name="characterId" value={characterId} />
      <Button type="submit" variant="secondary" size="sm" className="whitespace-nowrap">
        Make active
      </Button>

    </form>

  );
}
