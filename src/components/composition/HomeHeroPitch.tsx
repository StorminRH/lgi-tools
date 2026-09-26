'use client';

import type { ReactNode } from 'react';
import { useAuth } from '@/platform/auth/components/AuthProvider';

// The pitch is for visitors. It folds away once a session resolves instead of
// unmounting, so the hero around it keeps its DOM and its running animations.
export function HomeHeroPitch({ children }: { children: ReactNode }) {
  const folded = useAuth().session !== null;
  return (
    <div
      className="home-hero-pitch"
      data-folded={folded || undefined}
      aria-hidden={folded || undefined}
      inert={folded}
    >
      <div className="min-h-0">{children}</div>
    </div>
  );
}
