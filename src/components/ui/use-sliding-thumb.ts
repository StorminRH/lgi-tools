'use client';

import { type RefObject, useLayoutEffect } from 'react';

/**
 * Places a thumb under a track's pressed item, and moves it there whenever
 * the selection or the track's size changes. Until it is placed the track
 * carries no `data-thumb`, so the pressed item can keep its own fill; the
 * first placement is instant, later ones slide.
 */
export function useSlidingThumb(
  track: RefObject<HTMLElement | null>,
  thumb: RefObject<HTMLElement | null>,
  selected: string,
): void {
  useLayoutEffect(() => {
    const host = track.current;
    const marker = thumb.current;
    if (!host || !marker) return;
    const place = () => {
      const pressed = host.querySelector<HTMLElement>('[aria-pressed="true"]');
      if (!pressed) {
        host.removeAttribute('data-thumb');
        return;
      }
      marker.style.setProperty('--thumb-left', `${pressed.offsetLeft}px`);
      marker.style.setProperty('--thumb-top', `${pressed.offsetTop}px`);
      marker.style.setProperty('--thumb-width', `${pressed.offsetWidth}px`);
      marker.style.setProperty('--thumb-height', `${pressed.offsetHeight}px`);
      host.setAttribute('data-thumb', '');
    };
    place();
    const resized = new ResizeObserver(place);
    resized.observe(host);
    return () => resized.disconnect();
  }, [track, thumb, selected]);
}
