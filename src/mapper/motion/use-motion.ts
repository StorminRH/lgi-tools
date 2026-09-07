'use client';

import { useEffect, useMemo, useState } from 'react';
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

export interface MotionSeams {
  readonly now: () => number;
  readonly requestFrame: (callback: () => void) => number;
  readonly cancelFrame: (handle: number) => void;
  readonly prefersReducedMotion: PrefersReducedMotion;
}

export const BROWSER_MOTION_SEAMS: MotionSeams = {
  now: () => performance.now(),
  requestFrame: (callback) => window.requestAnimationFrame(() => callback()),
  cancelFrame: (handle) => window.cancelAnimationFrame(handle),
  prefersReducedMotion: browserPrefersReducedMotion,
};

export function useMotion(
  truth: MotionTruth,
  intents: readonly MapChainIntent[],
  access: boolean | undefined,
  config: MotionConfig,
  seams: MotionSeams,
): MotionPresentation {
  const [host, setHost] = useState<MotionHostState>(() =>
    createHostState(intents, truth.edges),
  );
  const plan = useMemo(() => tweenPlanOf(config, false), [config]);
  const reducedPlan = useMemo(() => tweenPlanOf(config, true), [config]);

  let live = host;
  if (access === false) {
    const adjusted = adjustHostForRender(host, {
      truth,
      intents,
      access,
      now: 0,
      plan,
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
        seams.prefersReducedMotion(),
      );
      if (step.changed) {
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

  return derivePresentation(truth, live, config.edgeFlavor);
}
