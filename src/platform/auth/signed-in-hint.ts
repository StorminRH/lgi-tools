// "This browser was signed in last time." The static shell cannot know the
// session, so an inline script reads this before first paint and lets
// session-shaped layout (today, only the home hero's pitch) start in its
// signed-in form. It is only a hint: AuthProvider rewrites it every time a
// session settles.
export const SIGNED_IN_HINT_KEY = 'lgi:signed-in';

export function writeSignedInHint(signedIn: boolean): void {
  try {
    if (signedIn) window.localStorage.setItem(SIGNED_IN_HINT_KEY, '1');
    else window.localStorage.removeItem(SIGNED_IN_HINT_KEY);
  } catch {
  }
}
