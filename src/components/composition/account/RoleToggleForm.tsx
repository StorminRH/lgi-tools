import { Button } from '@/components/ui/button';
import type { CharacterRole } from '@/platform/auth/types';
import { deriveRoleToggle } from './role-toggle-view';

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
      <Button
        type="submit"
        variant="secondary"
        size="sm"
        disabled={view.isSelf}
        title={view.isSelf ? "You can't change your own role" : undefined}
      >
        {view.label}
      </Button>

    </form>

  );
}
