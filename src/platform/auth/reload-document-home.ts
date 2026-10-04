import { clearRetiredPreferenceCookies } from '@/lib/preferences';
import { writeSignedInHint } from './signed-in-hint';

/**
 * Drop what this browser kept from the session that just ended: the
 * signed-in hint, and any retired preference cookies that may hold the
 * account's values. Call before the post sign-out navigation.
 */
export function forgetSignedInBrowser(): void {
  writeSignedInHint(false);
  clearRetiredPreferenceCookies();
}

export function reloadDocumentHome(): void {
  // Every caller has just signed out; the reloaded shell must not start in
  // the signed-in layout.
  forgetSignedInBrowser();
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- sign-out must wipe client auth state with a full navigation
  window.location.href = '/';
}
