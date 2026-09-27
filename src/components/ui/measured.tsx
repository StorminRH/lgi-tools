'use client';

import { type ReactNode, useEffect, useRef, useState } from 'react';

// The charts draw fixed-size SVG; measuring the column lets them fill it
// instead of leaving dead space beside a narrow plot.
export function Measured({ width, children }: { width?: number; children: (width: number) => ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState<number>();
  useEffect(() => {
    const element = ref.current;
    if (!element || width !== undefined) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setMeasured(Math.floor(entry.contentRect.width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [width]);
  const resolved = width ?? measured;
  return (
    <div ref={ref} className="w-full min-w-0">
      {resolved === undefined ? null : children(resolved)}
    </div>
  );
}
