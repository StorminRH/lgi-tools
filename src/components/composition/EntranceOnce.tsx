'use client';

import { useEffect } from 'react';

// Page entrances play once per element. Next keeps recently visited routes
// mounted but hidden (display: none), and CSS restarts an animation whenever
// its element is displayed again, so back/forward would otherwise replay the
// entrance of a page that is already there. Every name listed here needs a
// `[data-entered]` rule that turns its animation off.
const ENTRANCES = new Set(['reveal', 'home-preview-row', 'home-preview-draw']);

function markEntered(event: AnimationEvent): void {
  if (!ENTRANCES.has(event.animationName)) return;
  (event.target as Element).setAttribute('data-entered', '');
}

export function EntranceOnce() {
  useEffect(() => {
    document.addEventListener('animationend', markEntered, true);
    return () => document.removeEventListener('animationend', markEntered, true);
  }, []);
  return null;
}
