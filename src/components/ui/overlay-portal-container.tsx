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

export function useOverlayPortalContainer(): HTMLElement | null {
  return useContext(OverlayPortalContainerContext);
}
