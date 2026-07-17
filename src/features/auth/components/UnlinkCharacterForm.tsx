import { Button } from '@/components/ui/button';

/**
 * Per-row "unlink" control. Pure HTML form posting to
 * /api/account/characters/unlink — no client JS. The `disabled` state on the
 * only/last character is UI decoration; the route refuses it regardless. Mirrors
 * the admin RoleToggleForm pattern.
 */
export function UnlinkCharacterForm({
  characterId,
  disabled,
}: {
  characterId: number;
  disabled?: boolean;
}) {
  return (
    <form method="POST" action="/api/account/characters/unlink">
      <input type="hidden" name="characterId" value={characterId} />
      <Button
        type="submit"
        variant="secondary"
        size="sm"
        disabled={disabled}
        title={disabled ? "You can't unlink your only character" : undefined}
        className="whitespace-nowrap"
      >
        Unlink
      </Button>
    </form>
  );
}
