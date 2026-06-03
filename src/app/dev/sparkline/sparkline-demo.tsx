'use client';

import dynamic from 'next/dynamic';
import type { SparklinePoint, SparklineTone } from '@/components/ui/sparkline';

// Client-only: `ssr: false` keeps the chart out of the server-rendered shell so
// no SVG/tooltip markup is prerendered. `ssr: false` is only legal inside a
// Client Component — hence this wrapper.
const Sparkline = dynamic(
  () => import('@/components/ui/sparkline').then((m) => m.Sparkline),
  { ssr: false },
);

// Synthetic 24-hour series (deterministic — no DB; the market-prices layer
// stores only the current snapshot, so there is no real history to chart yet).
const BASE = Date.UTC(2026, 0, 1, 0, 0, 0);
const HOUR = 3_600_000;

function series(seed: number): SparklinePoint[] {
  return Array.from({ length: 24 }, (_, i) => {
    const drift = i * 1.3 * seed;
    const wave = Math.sin(i / 2.5 + seed) * 6 + Math.sin(i / 1.1) * 2.4;
    return { x: BASE + i * HOUR, y: 90 + drift + wave };
  });
}

const SAMPLE = series(1);
const STRIP: { tone: SparklineTone; label: string }[] = [
  { tone: 'orange', label: 'orange' },
  { tone: 'blue', label: 'blue' },
  { tone: 'purple', label: 'purple' },
];

const fmtY = (y: number) => `${y.toFixed(1)}M ISK`;
const fmtX = (x: number) =>
  new Date(x).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

export function SparklineDemo() {
  return (
    <div className="flex flex-col gap-6">
      <div className="border border-border bg-section rounded-[4px] p-5">
        <div className="text-[10px] text-muted tracking-[0.12em] uppercase mb-3">
          Hover for tooltip · crosshair
        </div>
        <Sparkline
          data={SAMPLE}
          tone="green"
          width={460}
          height={130}
          formatX={fmtX}
          formatY={fmtY}
          ariaLabel="Sample 24-hour price trend"
        />
      </div>

      <div className="border border-border bg-section rounded-[4px] p-5">
        <div className="text-[10px] text-muted tracking-[0.12em] uppercase mb-3">
          Tone reuse
        </div>
        <div className="flex flex-wrap gap-6">
          {STRIP.map(({ tone, label }, i) => (
            <div key={tone} className="flex flex-col gap-1">
              <Sparkline
                data={series(i + 2)}
                tone={tone}
                width={180}
                height={56}
                formatX={fmtX}
                formatY={fmtY}
                ariaLabel={`Sample ${label} sparkline`}
              />
              <span className="text-[9px] text-muted tracking-[0.1em] uppercase">
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
