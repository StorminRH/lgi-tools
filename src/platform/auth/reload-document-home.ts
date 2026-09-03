export function reloadDocumentHome(): void {
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- sign-out must wipe client auth state with a full navigation
  window.location.href = '/';
}
