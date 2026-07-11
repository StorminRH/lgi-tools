import type { CharacterRole } from '../types';
import { deriveRoleToggle } from './role-toggle-view';

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
  const view = deriveRoleToggle(currentRole, targetUserId, viewerUserId);

  return (
    <form method="POST" action="/api/admin/role">
      <input type="hidden" name="userId" value={targetUserId} />
      <input type="hidden" name="nextRole" value={view.nextRole} />
      {currentQuery ? (
        <input type="hidden" name="q" value={currentQuery} />
      ) : null}
      <button
        type="submit"
        disabled={view.isSelf}
        title={view.isSelf ? "You can't change your own role" : undefined}
        className="font-mono text-label uppercase tracking-[0.12em] px-2 py-1 border border-border-idle hover:border-border-active text-text transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-border-idle"
      >
        {view.label}
      </button>
    </form>
  );
}
