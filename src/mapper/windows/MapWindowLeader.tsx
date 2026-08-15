'use client';

import { forwardRef, useImperativeHandle, useRef } from 'react';
import type { FollowerWrite } from './follower-model';
import { applyFollowerWrite } from './follower-model';

/** Imperative seam the follower uses to paint the green leader without React. */
export interface MapWindowLeaderHandle {
  readonly apply: (card: HTMLElement, payload: FollowerWrite) => void;
  readonly hide: () => void;
}

/**
 * Screen-space green leader from an anchored card to its disc rim. Hidden
 * until the follower reports a segment long enough to need the cue.
 */
export const MapWindowLeader = forwardRef<MapWindowLeaderHandle>(
  function MapWindowLeader(_props, forwardedRef) {
    const lineRef = useRef<SVGLineElement | null>(null);
    const tokenRef = useRef<SVGCircleElement | null>(null);

    useImperativeHandle(forwardedRef, () => ({
      apply(card, payload) {
        applyFollowerWrite(card, lineRef.current, tokenRef.current, payload);
      },
      hide() {
        lineRef.current?.setAttribute('visibility', 'hidden');
        tokenRef.current?.setAttribute('visibility', 'hidden');
      },
    }));

    return (
      <svg
        data-map-window-leader
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[1] h-full w-full overflow-visible"
      >
        <line
          ref={lineRef}
          className="stroke-isk"
          strokeWidth={1.5}
          visibility="hidden"
        />
        <circle
          ref={tokenRef}
          r={3.5}
          className="fill-isk"
          visibility="hidden"
        />
      </svg>
    );
  },
);
