import type { CharacterRole } from '@/platform/auth/types';

export type RoleToggleView = {
  nextRole: CharacterRole;
  isSelf: boolean;
  label: string;
};

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
