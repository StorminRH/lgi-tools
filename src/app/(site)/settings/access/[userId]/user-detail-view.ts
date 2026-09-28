import type { ChipTone } from '@/components/ui/tones';
import type { AdminUser } from '@/platform/auth/admin-users';

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
}: {
  targetUser: AdminUser;
  charactersCount: number;
  sessionCount: number;
  viewerUserId: string;
  userId: string;
}): UserDetailView {
  const isViewerSelf = userId === viewerUserId;
  const roleChip: { tone: ChipTone; label: string } =
    targetUser.role === 'ADMIN'
      ? { tone: 'purple', label: 'Admin' }
      : { tone: 'blue', label: 'User' };
  return {
    characterIdLabel: targetUser.characterId != null ? String(targetUser.characterId) : '—',
    identityChips: isViewerSelf ? [roleChip, { tone: 'green', label: 'You' }] : [roleChip],
    isViewerSelf,
    isOnlyCharacter: charactersCount <= 1,
    forceLogoutDisabled: isViewerSelf || sessionCount === 0,
  };
}
