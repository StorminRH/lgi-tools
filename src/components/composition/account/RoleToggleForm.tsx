import { ActionForm } from '@/components/ui/action-form';
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

  // An empty search is left out, not posted as q="".
  return (
    <ActionForm
      action="/api/admin/role"
      fields={{ userId: targetUserId, nextRole: view.nextRole, q: currentQuery || undefined }}
      disabled={view.isSelf}
      disabledReason="You can't change your own role."
    >
      {view.label}
    </ActionForm>
  );
}
