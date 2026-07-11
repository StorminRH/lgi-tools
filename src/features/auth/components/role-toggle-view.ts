import type { CharacterRole } from '../types';

export type RoleToggleView = {
  nextRole: CharacterRole;
  isSelf: boolean;
  label: string;
};

// The per-row toggle's content: the role the button flips to, whether the row
// targets the viewer's own account (the disabled self-row), and the button copy.
export function deriveRoleToggle(
  currentRole: CharacterRole,
  targetUserId: string,
  viewerUserId: string,
): RoleToggleView {
  const isAdmin = currentRole === 'ADMIN';
  return {
    nextRole: isAdmin ? 'USER' : 'ADMIN',
    isSelf: targetUserId === viewerUserId,
    label: isAdmin ? 'Revoke ADMIN' : 'Grant ADMIN',
  };
}
