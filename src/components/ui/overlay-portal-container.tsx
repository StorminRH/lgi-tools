'use client';

import { createContext, useContext, type ReactNode } from 'react';

// Nested floating UI (Autocomplete / Menu / Select panels) portals to <body>
// by default at `z-dropdown`. Modal Dialog owns `z-overlay` above that, so a
// body-portaled panel paints under the lightbox blur. Overlay owners provide
// their popup element here; floating primitives prefer it as Portal.container
// so the panel shares the overlay stacking context (Base UI Portal `container`).

const OverlayPortalContainerContext = createContext<HTMLElement | null>(null);

/** Provides the active overlay popup element as the preferred floating-portal host. */
export function OverlayPortalContainerProvider({
  container,
  children,
}: {
  container: HTMLElement | null;
  children?: ReactNode;
}) {
  return (
    <OverlayPortalContainerContext.Provider value={container}>
      {children}
    </OverlayPortalContainerContext.Provider>
  );
}

/** The nearest overlay popup element, or null when no overlay owns the tree. */
export function useOverlayPortalContainer(): HTMLElement | null {
  return useContext(OverlayPortalContainerContext);
}
