'use client';

import { forwardRef, useImperativeHandle, useRef } from 'react';
import type { FollowerWrite } from './follower-model';
import { applyFollowerWrite } from './follower-model';

export interface MapWindowLeaderHandle {
  readonly apply: (card: HTMLElement, payload: FollowerWrite) => void;
  readonly hide: () => void;
}

/**
 * The callout from a selected disc to its card. It mounts per anchor, so the
 * draw-in plays each time a card opens; `closing` retracts it with the card.
 */
export const MapWindowLeader = forwardRef<
  MapWindowLeaderHandle,
  { readonly closing?: boolean }
>(function MapWindowLeader({ closing = false }, forwardedRef) {
  const pathRef = useRef<SVGPathElement | null>(null);
  const tokenRef = useRef<SVGCircleElement | null>(null);

  useImperativeHandle(forwardedRef, () => ({
    apply(card, payload) {
      applyFollowerWrite(card, pathRef.current, tokenRef.current, payload);
    },
    hide() {
      pathRef.current?.setAttribute('visibility', 'hidden');
      tokenRef.current?.setAttribute('visibility', 'hidden');
    },
  }));

  return (
    <svg
      data-map-window-leader
      data-closing={closing ? '' : undefined}
      aria-hidden
      className="pointer-events-none absolute inset-0 z-[1] h-full w-full overflow-visible"
    >
      <path
        ref={pathRef}
        pathLength={1}
        fill="none"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="map-leader-path stroke-isk"
        visibility="hidden"
      />
      <circle
        ref={tokenRef}
        r={3}
        className="map-leader-dot fill-isk"
        visibility="hidden"
      />
    </svg>
  );
});
