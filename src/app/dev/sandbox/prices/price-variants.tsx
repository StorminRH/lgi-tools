'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/components/ui/cn';
import { formatIsk } from '@/lib/format';
import { MOCK_PRICE } from '../_shared/mock-build';
import { usePriceCycle, useRafProgress } from '../_shared/use-price-cycle';

// The ten price-update animations. Each demos the same moment: a hero ISK figure
// going from last-known → confirmed-live (pending → settle). They share the
// usePriceCycle lifecycle; the page drives `autoLoop`, and each renders its own
// "Confirm live" trigger. Every effect is a stylesheet class or a CSS custom
// property set via ref.style.setProperty — no inline styles (CSP-clean).

const { lastKnown, confirmed } = MOCK_PRICE;

function fmt(n: number): string {
  return `${formatIsk(n)} ISK`;
}

// The value to show outside the pending window: last-known until a cycle
// settles, then the confirmed figure (held). During pending it's last-known.
// Pure — derived from the cycle's `settled` latch, no effect.
function committedValue(pending: boolean, settled: boolean): number {
  if (pending) return lastKnown;
  return settled ? confirmed : lastKnown;
}

// Shared frame: a fixed-height figure area + a trigger button.
function Stage({ onRun, children }: { onRun: () => void; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative h-[60px] flex items-center justify-center">{children}</div>
      <button
        type="button"
        onClick={onRun}
        className="text-[9px] tracking-[0.14em] uppercase px-3 py-1.5 border border-border-soft text-muted hover:text-name hover:border-border cursor-pointer transition-colors"
      >
        Confirm live ▸
      </button>
    </div>
  );
}

const FIGURE = 'font-mono font-bold text-[32px] text-isk tabular-nums leading-none';

// ── P1 — Shimmer Wave ────────────────────────────────────────────────────
export function ShimmerWave({ autoLoop }: { autoLoop: boolean }) {
  const c = usePriceCycle({ autoLoop });
  const shown = committedValue(c.pending, c.settled);
  return (
    <Stage onRun={c.trigger}>
      <span
        className={cn(
          FIGURE,
          c.pending && 'sbx-shimmer-pending',
          c.settling && 'sbx-settle-pulse',
        )}
      >
        {fmt(shown)}
      </span>
    </Stage>
  );
}

// ── P2 — Count-Up Roll ───────────────────────────────────────────────────
export function CountUpRoll({ autoLoop }: { autoLoop: boolean }) {
  const c = usePriceCycle({ autoLoop });
  const committed = committedValue(c.pending, c.settled);
  const p = useRafProgress(c.settling, 650, c.runId);
  const shown = c.settling ? lastKnown + (confirmed - lastKnown) * p : committed;
  return (
    <Stage onRun={c.trigger}>
      <span className={cn(FIGURE, c.pending && 'opacity-60')}>{fmt(shown)}</span>
    </Stage>
  );
}

// ── P3 — Odometer Digit Slide ────────────────────────────────────────────
function OdoDigit({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    ref.current?.style.setProperty('--digit', String(value));
  }, [value]);
  return (
    <span className="sbx-odo-col">
      <span ref={ref} className="sbx-odo-strip">
        {Array.from({ length: 10 }, (_, n) => (
          <span key={n} className="block h-[1em]">
            {n}
          </span>
        ))}
      </span>
    </span>
  );
}

export function OdometerSlide({ autoLoop }: { autoLoop: boolean }) {
  const c = usePriceCycle({ autoLoop });
  const shown = committedValue(c.pending, c.settled);
  const str = fmt(shown);
  return (
    <Stage onRun={c.trigger}>
      <span className={cn(FIGURE, 'inline-flex')}>
        {str.split('').map((ch, i) =>
          /\d/.test(ch) ? (
            <OdoDigit key={i} value={Number(ch)} />
          ) : (
            // Non-breaking space so the flex container doesn't collapse the gap.
            <span key={i}>{ch === ' ' ? ' ' : ch}</span>
          ),
        )}
      </span>
    </Stage>
  );
}

// ── P4 — Blur-to-Sharp Resolve ───────────────────────────────────────────
export function BlurResolve({ autoLoop }: { autoLoop: boolean }) {
  const c = usePriceCycle({ autoLoop });
  const shown = committedValue(c.pending, c.settled);
  return (
    <Stage onRun={c.trigger}>
      <span
        className={cn(FIGURE, c.pending && 'sbx-blur-pending', c.settling && 'sbx-blur-settle')}
      >
        {fmt(shown)}
      </span>
    </Stage>
  );
}

// ── P5 — Crossfade Swap ──────────────────────────────────────────────────
export function CrossfadeSwap({ autoLoop }: { autoLoop: boolean }) {
  const c = usePriceCycle({ autoLoop });
  const committed = committedValue(c.pending, c.settled);
  return (
    <Stage onRun={c.trigger}>
      {c.settling ? (
        <span className={cn(FIGURE, 'sbx-fade-stack')}>
          <span className="sbx-fade-out">{fmt(lastKnown)}</span>
          <span className="sbx-fade-in">{fmt(confirmed)}</span>
        </span>
      ) : (
        <span className={cn(FIGURE, c.pending && 'opacity-50')}>{fmt(committed)}</span>
      )}
    </Stage>
  );
}

// ── P6 — Scramble / Decrypt ──────────────────────────────────────────────
const GLYPHS = '0123456789';
function useScramble(active: boolean, template: string, runKey: number): string {
  const [s, setS] = useState(template);
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    let last = 0;
    const tick = (t: number) => {
      if (t - last > 55) {
        last = t;
        setS(
          template
            .split('')
            .map((ch) => (/\d/.test(ch) ? GLYPHS[Math.floor(Math.random() * 10)] : ch))
            .join(''),
        );
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, template, runKey]);
  // Inactive → show the real template; the scrambled state only applies while active.
  return active ? s : template;
}

export function ScrambleDecrypt({ autoLoop }: { autoLoop: boolean }) {
  const c = usePriceCycle({ autoLoop });
  const committed = committedValue(c.pending, c.settled);
  const scrambled = useScramble(c.pending, fmt(confirmed), c.runId);
  const shown = c.pending ? scrambled : fmt(committed);
  return (
    <Stage onRun={c.trigger}>
      <span className={cn(FIGURE, c.pending && 'sbx-scramble-pending', c.settling && 'sbx-settle-pulse')}>
        {shown}
      </span>
    </Stage>
  );
}

// ── P7 — Tick-Up / Tick-Down Flash ───────────────────────────────────────
export function TickFlash({ autoLoop }: { autoLoop: boolean }) {
  const c = usePriceCycle({ autoLoop });
  const shown = committedValue(c.pending, c.settled);
  const up = confirmed >= lastKnown;
  return (
    <Stage onRun={c.trigger}>
      <span className="flex items-center gap-2">
        <span className={cn(FIGURE, c.settling && (up ? 'sbx-tick-up' : 'sbx-tick-down'))}>
          {fmt(shown)}
        </span>
        {c.settling && (
          <span className={cn('text-[18px]', up ? 'text-isk' : 'text-[var(--color-dps-high)]')}>
            {up ? '▲' : '▼'}
          </span>
        )}
      </span>
    </Stage>
  );
}

// ── P8 — Underline Sweep Confirm ─────────────────────────────────────────
export function UnderlineSweep({ autoLoop }: { autoLoop: boolean }) {
  const c = usePriceCycle({ autoLoop });
  const shown = committedValue(c.pending, c.settled);
  return (
    <Stage onRun={c.trigger}>
      <span
        className={cn(
          FIGURE,
          'sbx-underline',
          c.pending && 'sbx-underline-pending',
          c.settling && 'sbx-underline-settle',
        )}
      >
        {fmt(shown)}
      </span>
    </Stage>
  );
}

// ── P9 — Pulse-Ring Settle ───────────────────────────────────────────────
export function PulseRing({ autoLoop }: { autoLoop: boolean }) {
  const c = usePriceCycle({ autoLoop });
  const shown = committedValue(c.pending, c.settled);
  return (
    <Stage onRun={c.trigger}>
      <span
        key={c.runId}
        className={cn(FIGURE, 'sbx-ring', c.settling && 'sbx-ring-settle', c.pending && 'opacity-60')}
      >
        {fmt(shown)}
      </span>
    </Stage>
  );
}

// ── P10 — Particle Lift (SVG) ────────────────────────────────────────────
const PARTICLES = [
  { cx: 14, cy: 22 },
  { cx: 30, cy: 18 },
  { cx: 46, cy: 24 },
  { cx: 62, cy: 17 },
  { cx: 78, cy: 23 },
];

export function ParticleLift({ autoLoop }: { autoLoop: boolean }) {
  const c = usePriceCycle({ autoLoop });
  const shown = committedValue(c.pending, c.settled);
  return (
    <Stage onRun={c.trigger}>
      <span className="relative inline-flex items-center justify-center">
        {c.settling && (
          <svg
            key={c.runId}
            width={92}
            height={30}
            viewBox="0 0 92 30"
            className="absolute left-1/2 -translate-x-1/2 -top-4 pointer-events-none"
            aria-hidden
          >
            {PARTICLES.map((d, i) => (
              <circle
                key={i}
                className="sbx-particle sbx-particle-go"
                ref={(el) => el?.style.setProperty('--d', String(i))}
                cx={d.cx}
                cy={d.cy}
                r={2.4}
                fill="#3dd68c"
              />
            ))}
          </svg>
        )}
        <span className={cn(FIGURE, c.settling && 'sbx-settle-pulse', c.pending && 'opacity-60')}>
          {fmt(shown)}
        </span>
      </span>
    </Stage>
  );
}
