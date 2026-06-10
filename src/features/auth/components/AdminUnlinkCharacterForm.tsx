'use client';

// Admin force-unlink control. Pure HTML form posting to
// /api/admin/characters/unlink, with a confirm() gate (bundled client JS — no
// inline handler/style attribute, which the production CSP drops). The route is
// the real guard; `disabled` (the user's last character) is UI decoration.
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
      <button
        type="submit"
        disabled={disabled}
        title={disabled ? "Can't unlink the user's only character — reassign it instead" : undefined}
        className="font-mono text-[10px] uppercase tracking-[0.12em] px-2 py-1 border border-border-idle hover:border-border-active text-muted hover:text-text transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-border-idle whitespace-nowrap"
      >
        Unlink
      </button>
    </form>
  );
}
