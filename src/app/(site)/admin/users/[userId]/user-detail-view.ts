import type { ChipTone } from '@/components/ui/tones';
import type { AdminUser } from '@/platform/auth/admin-users';
import { adminRoleBadge } from '../access-view';

export type UserDetailView = {
  characterIdLabel: string;
  identityChips: { tone: ChipTone; label: string }[];
  isViewerSelf: boolean;
  isOnlyCharacter: boolean;
  forceLogoutDisabled: boolean;
};

export function deriveUserDetailView({
  targetUser,
  charactersCount,
  sessionCount,
  viewerUserId,
  userId,
  isSuperadmin = false,
}: {
  targetUser: AdminUser;
  charactersCount: number;
  sessionCount: number;
  viewerUserId: string;
  userId: string;
  isSuperadmin?: boolean;
}): UserDetailView {
  const isViewerSelf = userId === viewerUserId;
  const roleChip = adminRoleBadge({ isSuperadmin, role: targetUser.role });
  return {
    characterIdLabel: targetUser.characterId != null ? String(targetUser.characterId) : '—',
    identityChips: isViewerSelf ? [roleChip, { tone: 'green', label: 'You' }] : [roleChip],
    isViewerSelf,
    isOnlyCharacter: charactersCount <= 1,
    forceLogoutDisabled: isViewerSelf || sessionCount === 0,
  };
}
