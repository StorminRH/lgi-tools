'use client';

// The motion derivation host's React half. The state machine and derivation
// live in `motion-host-model.ts`; this file owns only the hook and the
// browser seams, and deliberately exports nothing that would let a second
// consumer construct or step host state outside the hook — the single
// position authority (HC-1) stays single by keeping this surface narrow.
//
// Intent batches are consumed exactly once by identity (the camera's
// discipline), during render through the adjust-state-while-rendering pattern —
// an effect would arrive one commit late and let a `system-moved` merge paint
// one frame at its raw target.
//
// The requestAnimationFrame loop runs only while the scheduler is active and
// unregisters when it drains (HC-5). Every environment dependency — clock,
// frame scheduling, reduced-motion — is injected (`MotionSeams`), following
// the `live-price.tsx` scheduler-seam pattern. The live drag set arrives as
// committed state for render-time derivation and is mirrored into a hook-owned
// ref for the frame callbacks (the `ChainHost` mirror pattern), so cancel-on-
// drag cannot go stale across the async frame window without any render-time
// ref read.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { MapChainIntent } from '../chain/intents';
import {
  browserPrefersReducedMotion,
  tweenPlanOf,
  type MotionConfig,
  type PrefersReducedMotion,
} from './motion-contract';
import {
  adjustHostForRender,
  createHostState,
  derivePresentation,
  stepHost,
  type MotionHostState,
  type MotionPresentation,
  type MotionTruth,
} from './motion-host-model';
import { isIdle } from './tween-model';

/** Environment dependencies, injectable for tests (`live-price.tsx` pattern). */
export interface MotionSeams {
  readonly now: () => number;
  readonly requestFrame: (callback: () => void) => number;
  readonly cancelFrame: (handle: number) => void;
  readonly prefersReducedMotion: PrefersReducedMotion;
}

/**
 * The browser-backed seams — a module constant, so its identity never churns
 * a dependency list. Every closure calls through `window`/`performance` at
 * invocation time (extracting `requestAnimationFrame` as a bare function
 * throws TypeError), so constructing this during import is side-effect-free.
 */
export const BROWSER_MOTION_SEAMS: MotionSeams = {
  now: () => performance.now(),
  requestFrame: (callback) => window.requestAnimationFrame(() => callback()),
  cancelFrame: (handle) => window.cancelAnimationFrame(handle),
  prefersReducedMotion: browserPrefersReducedMotion,
};

/**
 * The React host. Consumes each distinct `intents` array exactly once by
 * identity; empty or repeated arrays schedule nothing. The `access === false`
 * reset in the model is a defensive invariant: `ChainLive` unmounts this hook
 * behind the calm no-access panel in the current tree, so the branch cannot
 * fire today, but a future tree that renders both stays safe.
 */
export function useMotion(
  truth: MotionTruth,
  intents: readonly MapChainIntent[],
  access: boolean | undefined,
  dragging: ReadonlySet<number>,
  config: MotionConfig,
  seams: MotionSeams,
): MotionPresentation {
  const [host, setHost] = useState<MotionHostState>(() =>
    createHostState(intents, truth.edges),
  );
  // Both plan shapes come from the one dial→plan owner; the render below only
  // selects between them, so a refinement of the reduced-motion mapping in
  // `tweenPlanOf` reaches the live call site automatically.
  const plan = useMemo(() => tweenPlanOf(config, false), [config]);
  const reducedPlan = useMemo(() => tweenPlanOf(config, true), [config]);

  // Mirrors the committed drag set for the frame callbacks (the ChainHost
  // mirror pattern): render-time work uses the prop, async work the ref.
  const draggingRef = useRef(dragging);
  useEffect(() => {
    draggingRef.current = dragging;
  }, [dragging]);

  // Adjust-state-while-rendering: adoption must land in the same commit as the
  // truth it accompanies, or a forced move paints one frame at its raw target.
  // Environment seams stay unread on quiet renders and on the access-loss path
  // (createHostState needs no clock or reduced-motion read), so a server render
  // that only hits the defensive reset cannot touch `window`.
  let live = host;
  if (access === false) {
    const adjusted = adjustHostForRender(host, {
      truth,
      intents,
      access,
      now: 0,
      plan,
      dragging,
      flavor: config.edgeFlavor,
    });
    if (adjusted !== null) {
      live = adjusted;
      setHost(adjusted);
    }
  } else if (host.consumed !== intents) {
    const adjusted = adjustHostForRender(host, {
      truth,
      intents,
      access,
      now: seams.now(),
      plan: seams.prefersReducedMotion() ? reducedPlan : plan,
      dragging,
      flavor: config.edgeFlavor,
    });
    if (adjusted !== null) {
      live = adjusted;
      setHost(adjusted);
    }
  }

  useEffect(() => {
    if (isIdle(host.motion)) return;
    let cancelled = false;
    let handle = 0;
    const tick = () => {
      if (cancelled) return;
      const step = stepHost(
        host,
        seams.now(),
        plan.ease,
        draggingRef.current,
        seams.prefersReducedMotion(),
      );
      if (step.changed) {
        // The state change re-runs this effect, which schedules the next frame.
        setHost(step.next);
        return;
      }
      if (step.active) handle = seams.requestFrame(tick);
    };
    handle = seams.requestFrame(tick);
    return () => {
      cancelled = true;
      seams.cancelFrame(handle);
    };
  }, [host, plan, seams]);

  return derivePresentation(truth, live, dragging, config.edgeFlavor);
}
