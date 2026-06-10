// Per-row "make active" control. Pure HTML form posting to
// /api/account/active-character — no client JS. The route is the real guard
// (it ownership-checks the character id); this is just the affordance. Mirrors
// the admin RoleToggleForm pattern.
export function SwitchCharacterForm({ characterId }: { characterId: number }) {
  return (
    <form method="POST" action="/api/account/active-character">
      <input type="hidden" name="characterId" value={characterId} />
      <button
        type="submit"
        className="font-mono text-[10px] uppercase tracking-[0.12em] px-2 py-1 border border-border-idle hover:border-border-active text-text transition-colors whitespace-nowrap"
      >
        Make active
      </button>
    </form>
  );
}
