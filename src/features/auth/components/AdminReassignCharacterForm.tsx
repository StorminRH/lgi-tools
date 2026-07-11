'use client';

// Admin reassign control — moves a character onto the acting admin's own account
// (the destination is fixed server-side to the caller). Pure HTML form with a
// confirm() gate (bundled client JS — CSP-safe). `disabled` is set when viewing
// your own account, where a move would be a no-op.
export function AdminReassignCharacterForm({
  characterId,
  characterName,
  fromUserId,
  disabled,
}: {
  characterId: number;
  characterName: string;
  fromUserId: string;
  disabled?: boolean;
}) {
  return (
    <form
      method="POST"
      action="/api/admin/characters/reassign"
      onSubmit={(e) => {
        if (
          !window.confirm(
            `Move ${characterName} (ID ${characterId}) onto your account? If this leaves the source account empty, it will be removed.`,
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="characterId" value={characterId} />
      <input type="hidden" name="fromUserId" value={fromUserId} />
      <button
        type="submit"
        disabled={disabled}
        title={disabled ? 'This character is already on your account' : undefined}
        className="font-mono text-label uppercase tracking-[0.12em] px-2 py-1 border border-border-idle hover:border-border-active text-isk transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-border-idle whitespace-nowrap"
      >
        Reassign to me
      </button>
    </form>
  );
}
