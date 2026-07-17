import { Button } from '@/components/ui/button';

/**
 * Per-row "make active" control. Pure HTML form posting to
 * /api/account/active-character — no client JS. The route is the real guard
 * (it ownership-checks the character id); this is just the affordance. Mirrors
 * the admin RoleToggleForm pattern.
 */
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
