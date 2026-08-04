/**
 * Whether a live `canEdit` change should fire the quiet rights-transition toast.
 * First answer (`previous === undefined`) is mount, not a transition.
 */
export function shouldToastRightsTransition(
  previous: boolean | undefined,
  next: boolean | undefined,
): boolean {
  if (previous === undefined || next === undefined) return false;
  return previous !== next;
}
