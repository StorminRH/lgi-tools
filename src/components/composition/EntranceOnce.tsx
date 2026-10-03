'use client';

import { usePathname } from 'next/navigation';
import { Suspense, useEffect, useRef } from 'react';

// Page entrances play once per element. Next keeps recently visited routes
// mounted but hidden (display: none), and CSS restarts an animation whenever
// its element is displayed again, so back/forward would otherwise replay the
// entrance of a page that is already there. Every name listed here needs a
// `[data-entered]` rule that turns its animation off.
const ENTRANCES = new Set(['reveal']);

const finished = new Set<Element>();

function recordFinished(event: AnimationEvent): void {
  if (ENTRANCES.has(event.animationName)) finished.add(event.target as Element);
}

// Marks go on when the route changes, which is when Next hides the route that
// is being left. Marking as each entrance ends, or when Strict Mode replays the
// effect on first mount, could touch server HTML inside a boundary that has not
// hydrated yet.
function markFinished(): void {
  for (const element of finished) {
    if (element.isConnected) element.setAttribute('data-entered', '');
  }
  finished.clear();
}

function MarkOnRouteChange() {
  const pathname = usePathname();
  const shown = useRef(pathname);
  useEffect(() => {
    if (shown.current === pathname) return;
    shown.current = pathname;
    markFinished();
  }, [pathname]);
  return null;
}

// The listener mounts with the root so no early entrance goes unrecorded;
// only the pathname read waits in a Suspense hole (it suspends on routes
// with unknown params).
export function EntranceOnce() {
  useEffect(() => {
    document.addEventListener('animationend', recordFinished, true);
    return () => document.removeEventListener('animationend', recordFinished, true);
  }, []);
  return (
    <Suspense fallback={null}>
      <MarkOnRouteChange />
    </Suspense>
  );
}
