import type { CharacterRole } from '../types';

// Per-row toggle. Pure HTML form posting to /api/admin/role — no client JS.
// The disabled self-row is UI decoration; the route handler is the real guard.
// Admin is per-user, so the toggle targets a userId (not a character id).
export function RoleToggleForm({
  targetUserId,
  currentRole,
  viewerUserId,
  currentQuery,
}: {
  targetUserId: string;
  currentRole: CharacterRole;
  viewerUserId: string;
  currentQuery: string | undefined;
}) {
  const nextRole: CharacterRole = currentRole === 'ADMIN' ? 'USER' : 'ADMIN';
  const isSelf = targetUserId === viewerUserId;
  const label = currentRole === 'ADMIN' ? 'Revoke ADMIN' : 'Grant ADMIN';

  return (
    <form method="POST" action="/api/admin/role">
      <input type="hidden" name="userId" value={targetUserId} />
      <input type="hidden" name="nextRole" value={nextRole} />
      {currentQuery ? (
        <input type="hidden" name="q" value={currentQuery} />
      ) : null}
      <button
        type="submit"
        disabled={isSelf}
        title={isSelf ? "You can't change your own role" : undefined}
        className="font-mono text-[10px] uppercase tracking-[0.12em] px-2 py-1 border border-border-idle hover:border-border-active text-text transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-border-idle"
      >
        {label}
      </button>
    </form>
  );
}
