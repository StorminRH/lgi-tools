'use client';

import { useRef, type ReactNode } from 'react';
import { useNpcNameColScope } from './npc-name-col';

export function NpcNameColScope({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useNpcNameColScope(ref);

  return (
    <div ref={ref} className="contents">
      {children}
    </div>
  );
}
