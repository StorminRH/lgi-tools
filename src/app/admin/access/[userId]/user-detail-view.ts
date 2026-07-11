import type { ChipTone } from '@/components/ui/tones';
import type { AdminUser } from '@/features/auth/queries';

export type UserDetailView = {
  characterIdLabel: string;
  identityChips: { tone: ChipTone; label: string }[];
  isViewerSelf: boolean;
  isOnlyCharacter: boolean;
  forceLogoutDisabled: boolean;
};

// Folds the admin user-detail header/session reads into one view: the character-id
// label, the identity chips (the role chip always, plus a "You" chip when the admin
// is looking at their own account), and the self / only-character / force-logout
// flags the per-character rows and the force-logout control disable on. The admin
// gate and DB reads stay in the page shell; this takes their already-resolved
// values.
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
