import { clearRetiredPreferenceCookies } from '@/lib/preferences';
import { authClient } from './auth-client';
import { writeSignedInHint } from './signed-in-hint';

/**
 * Leave with a full document navigation after the session has ended. It first
 * drops what this browser kept from that session: the signed-in hint, so the
 * reloaded shell does not start in the signed-in layout, and any retired
 * preference cookies that may hold the account's values. The navigation is a
 * full one, not a router push, so that client auth state is wiped too.
 */
export function reloadDocumentHome(target = '/'): void {
  writeSignedInHint(false);
  clearRetiredPreferenceCookies();
  window.location.href = target;
}

/**
 * Sign out, then leave for `target` whatever the outcome. The callers' sessions
 * are already over, or the user asked to go, so a failed or rejected sign-out
 * still leaves.
 */
export function signOutAndLeave(target = '/'): void {
  const leave = () => reloadDocumentHome(target);
  void authClient.signOut().then(leave, leave);
}
