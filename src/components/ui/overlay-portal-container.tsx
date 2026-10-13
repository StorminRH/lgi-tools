'use client';

import { createContext, useContext, type ReactNode } from 'react';

const OverlayPortalContainerContext = createContext<HTMLElement | null>(null);

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

/**
 * The open dialog's popup element, for a nested popup's Portal `container`.
 * Undefined outside a dialog and on the dialog's first frame: Base UI reads
 * `container={null}` as "wait" and mounts nothing until it changes.
 */
export function useOverlayPortalContainer(): HTMLElement | undefined {
  return useContext(OverlayPortalContainerContext) ?? undefined;
}
