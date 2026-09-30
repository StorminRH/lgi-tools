import { getOAuthState } from 'better-auth/api';

type LinkState = { link?: { userId: string } } | null;

export async function readLinkingUserId(): Promise<string | null> {
  try {
    const state = (await getOAuthState()) as LinkState;
    return state?.link?.userId ?? null;
  } catch {
    return null;
  }
}

/**
 * Points Better Auth's pending link branch at the survivor. Better Auth 1.6
 * destructures `link` from the same state object getOAuthState() returns
 * (pinned by link-merge.spike.test.ts), so its own same-user relink path then
 * writes the fresh tokens and redirects to the success callbackURL.
 */
export async function rebindLinkTarget(survivorUserId: string): Promise<void> {
  const state = (await getOAuthState()) as LinkState;
  if (!state?.link) throw new Error('rebindLinkTarget called outside a link callback');
  state.link.userId = survivorUserId;
}
