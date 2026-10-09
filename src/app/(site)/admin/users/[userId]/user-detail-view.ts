import type { ChipTone } from '@/components/ui/tones';
import type { CharacterRole } from '@/platform/auth/types';
import { adminRoleBadge } from '../access-view';

/** The account's effective role, and "You" when the viewing admin is looking at their own account. */
export function deriveIdentityChips({
  role,
  isSuperadmin,
  isViewerSelf,
}: {
  role: CharacterRole;
  isSuperadmin: boolean;
  isViewerSelf: boolean;
}): { tone: ChipTone; label: string }[] {
  const roleChip = adminRoleBadge({ isSuperadmin, role });
  return isViewerSelf ? [roleChip, { tone: 'green', label: 'You' }] : [roleChip];
}

/** Force logout is for other people's live sessions; an admin signs themself out normally. */
export function forceLogoutDisabled(isViewerSelf: boolean, sessionCount: number): boolean {
  return isViewerSelf || sessionCount === 0;
}
