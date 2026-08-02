// Pure camera-follow policy, kept apart from the hook so the framing rules are
// unit-tested rather than browser-observed.
import type { MapChainIntent } from '../chain/intents';

/** System ids an intent batch would ask the camera to frame. */
export function systemsNeedingFit(
  intents: readonly MapChainIntent[],
): readonly number[] {
  return intents.flatMap((intent) =>
    intent.kind === 'system-appeared' || intent.kind === 'system-moved'
      ? [intent.systemId]
      : [],
  );
}

/**
 * Whether React Flow already holds every node a fit would target.
 *
 * ChainHost commits reconciler positions in a passive effect, so the camera
 * hook must wait for those nodes before calling `fitView` — otherwise the
 * first framing (and follow refits) target the previous empty/stale set, and
 * the intent-identity guard never retries.
 */
export function nodesReadyForFit(
  intents: readonly MapChainIntent[],
  nodeIds: ReadonlySet<number>,
): boolean {
  return systemsNeedingFit(intents).every((systemId) => nodeIds.has(systemId));
}

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

/** Hook action for one intent/node observation. */
export type CameraFitAction = 'ignore' | 'wait' | 'skip' | 'fit';

/** Whether the hook should consume the intent batch and/or call `fitView`. */
export type CameraFitPlan = {
  readonly consume: boolean;
  readonly fit: boolean;
};

/**
 * Pure camera-fit decision for one effect tick.
 *
 * - `ignore`: same intent batch already consumed
 * - `wait`: fit is warranted but React Flow nodes are not ready yet
 * - `skip`: consume the batch without fitting
 * - `fit`: consume the batch and call `fitView`
 */
export function decideCameraFit(input: {
  readonly intents: readonly MapChainIntent[];
  readonly previousIntents: readonly MapChainIntent[];
  readonly framed: boolean;
  readonly follow: boolean;
  readonly dragActive: boolean;
  readonly nodeIds: ReadonlySet<number>;
}): CameraFitAction {
  if (input.intents === input.previousIntents) return 'ignore';
  if (
    !shouldFitView({
      intents: input.intents,
      framed: input.framed,
      follow: input.follow,
      dragActive: input.dragActive,
    })
  ) {
    return 'skip';
  }
  if (!nodesReadyForFit(input.intents, input.nodeIds)) return 'wait';
  return 'fit';
}

/** Maps a fit action onto the two ref updates the hook performs. */
export function planCameraFit(action: CameraFitAction): CameraFitPlan {
  switch (action) {
    case 'ignore':
    case 'wait':
      return { consume: false, fit: false };
    case 'skip':
      return { consume: true, fit: false };
    case 'fit':
      return { consume: true, fit: true };
  }
}
