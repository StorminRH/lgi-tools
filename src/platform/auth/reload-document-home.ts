import { writeSignedInHint } from './signed-in-hint';

export function reloadDocumentHome(): void {
  // Every caller has just signed out; the reloaded shell must not start in
  // the signed-in layout.
  writeSignedInHint(false);
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- sign-out must wipe client auth state with a full navigation
  window.location.href = '/';
}
