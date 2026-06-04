'use client';

import { useState, type ComponentType } from 'react';
import { VariantFrame } from '../_shared/sandbox-ui';
import {
  BlurResolve,
  CountUpRoll,
  CrossfadeSwap,
  OdometerSlide,
  ParticleLift,
  PulseRing,
  ScrambleDecrypt,
  ShimmerWave,
  TickFlash,
  UnderlineSweep,
} from './price-variants';

interface Variant {
  tag: string;
  title: string;
  notes: string;
  Component: ComponentType<{ autoLoop: boolean }>;
}

const VARIANTS: Variant[] = [
  { tag: 'Price v1', title: 'Shimmer wave', notes: 'The site’s current effect — a light sweep while pending, brightness pulse on settle.', Component: ShimmerWave },
  { tag: 'Price v2', title: 'Count-up roll', notes: 'Value tweens up to the confirmed figure (rAF). Reads as "tallying".', Component: CountUpRoll },
  { tag: 'Price v3', title: 'Odometer slide', notes: 'Each digit column mechanically rolls to its new glyph.', Component: OdometerSlide },
  { tag: 'Price v4', title: 'Blur to sharp', notes: 'Pending is blurred + dim, snaps into focus on settle.', Component: BlurResolve },
  { tag: 'Price v5', title: 'Crossfade swap', notes: 'Old value fades out as the new one fades up, stacked.', Component: CrossfadeSwap },
  { tag: 'Price v6', title: 'Scramble / decrypt', notes: 'Digits cycle randomly while confirming, then lock in.', Component: ScrambleDecrypt },
  { tag: 'Price v7', title: 'Tick flash', notes: 'Directional up/down flash + arrow on settle (green up, red down).', Component: TickFlash },
  { tag: 'Price v8', title: 'Underline sweep', notes: 'A bar sweeps under the figure while pending, then locks.', Component: UnderlineSweep },
  { tag: 'Price v9', title: 'Pulse ring', notes: 'A single ring blooms out from behind the figure on settle.', Component: PulseRing },
  { tag: 'Price v10', title: 'Particle lift', notes: 'A few SVG sparks rise and fade when the value lands.', Component: ParticleLift },
];

export function PricesDemo() {
  const [autoLoop, setAutoLoop] = useState(true);

  return (
    <>
      <div className="w-full max-w-[1100px] flex items-center justify-end mb-5">
        <button
          type="button"
          onClick={() => setAutoLoop((v) => !v)}
          aria-pressed={autoLoop}
          className="text-[9px] tracking-[0.14em] uppercase px-3 py-1.5 border border-border-soft text-muted hover:text-name hover:border-border cursor-pointer transition-colors"
        >
          Auto-loop: {autoLoop ? 'on' : 'off'}
        </button>
      </div>

      <div className="w-full max-w-[1100px] grid gap-6 grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
        {VARIANTS.map((v) => (
          <VariantFrame key={v.tag} tag={v.tag} title={v.title} notes={v.notes}>
            <v.Component autoLoop={autoLoop} />
          </VariantFrame>
        ))}
      </div>
    </>
  );
}
