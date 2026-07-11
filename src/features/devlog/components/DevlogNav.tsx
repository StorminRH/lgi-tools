'use client';

import { usePathname } from 'next/navigation';
import type { DevlogNavModel } from '../types';
import { deriveActiveSlug } from './devlog-nav-view';
import { NavTree } from './NavTree';

// Highlights the active document from the URL. usePathname is request-time, so this
// is rendered inside a <Suspense> in the layout (the NavTools pattern) — the static
// shell shows the rail with no active state, then this streams the highlight in.
export function DevlogNav({ model }: { model: DevlogNavModel }) {
  const pathname = usePathname();
  return <NavTree model={model} activeSlug={deriveActiveSlug(pathname, model)} />;
}
