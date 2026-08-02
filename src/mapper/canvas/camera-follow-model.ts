// Pure camera-follow policy, kept apart from the hook so the framing rules are
// unit-tested rather than browser-observed.
import type { MapChainIntent } from '../chain/intents';

/**
 * Whether a merge's intents warrant a viewport fit. The first fit is initial
 * presentation and ignores the follow toggle — without it a fresh map load
 * leaves the layout origin in the top-left corner under the chrome. Every
 * later fit is following: it requires the toggle on and no active drag
 * (operator G-1 call: the camera must not move on its own).
 */
export function shouldFitView(input: {
  readonly intents: readonly MapChainIntent[];
  readonly framed: boolean;
  readonly follow: boolean;
  readonly dragActive: boolean;
}): boolean {
  const appeared = input.intents.some(
    (intent) => intent.kind === 'system-appeared' || intent.kind === 'system-moved',
  );
  if (!appeared) return false;
  if (!input.framed) return true;
  return input.follow && !input.dragActive;
}
