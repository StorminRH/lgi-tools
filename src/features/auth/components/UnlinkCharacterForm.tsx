// Per-row "unlink" control. Pure HTML form posting to
// /api/account/characters/unlink — no client JS. The `disabled` state on the
// only/last character is UI decoration; the route refuses it regardless. Mirrors
// the admin RoleToggleForm pattern.
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
      <button
        type="submit"
        disabled={disabled}
        title={disabled ? "You can't unlink your only character" : undefined}
        className="font-mono text-label uppercase tracking-[0.12em] px-2 py-1 border border-border-idle hover:border-border-active text-muted hover:text-text transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-border-idle whitespace-nowrap"
      >
        Unlink
      </button>
    </form>
  );
}
