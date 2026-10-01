'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { LoadingLabel } from '@/components/ui/loading-label';
import { Skeleton } from '@/components/ui/skeleton';
import { PrototypeGroup, VariantCard } from './gallery';

const ROW_WIDTHS = [['w-2/5', 'w-1/4'], ['w-1/2', 'w-1/5'], ['w-1/3', 'w-1/4']] as const;

const LOADED_ROWS = [
  { name: 'Praxis', meta: '3 runs · ME 8', value: '+41.2M' },
  { name: 'Gila', meta: '1 run · ME 10', value: '+18.6M' },
  { name: 'Ishtar', meta: '2 runs · ME 6', value: '+27.9M' },
] as const;

/** The shared list-card shape every candidate fills with its own bone style. */
function BoneList({ bone, round = 'rounded-full' }: { bone: string; round?: string }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-4">
        <div className="flex w-1/2 flex-col gap-2">
          <span className={cn(bone, 'h-2.5 w-2/3')} />
          <span className={cn(bone, 'h-6 w-full')} />
        </div>
        <span className={cn(bone, 'h-8 w-20')} />
      </div>
      <div className="flex flex-col gap-3">
        {ROW_WIDTHS.map(([name, value]) => (
          <div key={name} className="flex items-center gap-3">
            <span className={cn(bone, round, 'size-9 shrink-0')} />
            <div className="flex flex-1 flex-col gap-1.5">
              <span className={cn(bone, 'h-3', name)} />
              <span className={cn(bone, 'h-2.5 w-1/3')} />
            </div>
            <span className={cn(bone, 'h-3', value)} />
          </div>
        ))}
      </div>
    </div>
  );
}

function LoadedList() {
  return (
    <div className="flex flex-col gap-4">
      <div className="pt-reveal-in flex items-end justify-between gap-4">
        <div className="flex flex-col">
          <span className="font-ui text-label text-muted">Margin today</span>
          <span className="font-ui text-h3 font-semibold text-name pt-tabular">+87.7M ISK</span>
        </div>
        <span className="pt-pill pt-pill-a" data-tone="green">3 plans</span>
      </div>
      {LOADED_ROWS.map((row) => (
        <div key={row.name} className="pt-reveal-in flex items-center gap-3">
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-row-on font-ui text-ui text-name">
            {row.name.slice(0, 1)}
          </span>
          <div className="flex flex-1 flex-col">
            <span className="font-ui text-ui text-name">{row.name}</span>
            <span className="font-ui text-label text-muted">{row.meta}</span>
          </div>
          <span className="font-ui text-ui font-semibold text-isk pt-tabular">{row.value}</span>
        </div>
      ))}
    </div>
  );
}

function RevealDemo() {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (loaded) return;
    const timer = window.setTimeout(() => setLoaded(true), 2400);
    return () => window.clearTimeout(timer);
  }, [loaded]);
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-5 sm:grid-cols-2">
        <BoneList bone="pt-skel pt-skel-d" />
        {loaded ? <LoadedList /> : <BoneList bone="pt-skel pt-skel-d" />}
      </div>
      <button type="button" className="pt-ghost-btn self-start" onClick={() => setLoaded(false)}>
        Replay reveal
      </button>
    </div>
  );
}

function CurrentSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card>
        {[['w-2/5', 'w-16'], ['w-3/5', 'w-12'], ['w-1/3', 'w-20']].map(([left, right]) => (
          <div key={left} className="flex justify-between gap-3 border-b border-border-soft px-4 py-3 last:border-0">
            <Skeleton className={`h-3 ${left}`} />
            <Skeleton className={`h-3 ${right}`} />
          </div>
        ))}
      </Card>
      <div className="flex flex-col gap-2.5">
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="h-6 w-3/5" />
        <LoadingLabel />
      </div>
    </div>
  );
}

export function SkeletonsGroup() {
  return (
    <PrototypeGroup
      id="skeletons"
      title="Loading skeletons"
      today="Today: square-ish grey bars with a fast linear shimmer and an uppercase LOADING… label."
    >
      <VariantCard letter="Now" name="Linear shimmer" pitch="The shipping Skeleton and LoadingLabel.">
        <CurrentSkeleton />
      </VariantCard>
      <VariantCard letter="A" name="Soft glass shimmer" pitch="Rounded-end bones with a wide, slow, eased sheen. Calm enough to sit on glass cards.">
        <BoneList bone="pt-skel pt-skel-a" />
      </VariantCard>
      <VariantCard letter="B" name="Breathing cascade" pitch="No sweep: each row breathes in turn, top to bottom, so loading reads as order rather than flicker.">
        <BoneList bone="pt-skel pt-skel-b" round="rounded-full" />
      </VariantCard>
      <VariantCard letter="C" name="Aurora sweep" pitch="One continuous aurora-tinted light passes across every bone in the card, like a scanner pass.">
        <div className="pt-skel-c-scope">
          <BoneList bone="pt-skel pt-skel-c" round="rounded-full" />
        </div>
      </VariantCard>
      <VariantCard letter="D" name="Content ghost + reveal" pitch="Bones match the real layout, then content blurs in row by row. The right side loads after 2.4s.">
        <RevealDemo />
      </VariantCard>
      <VariantCard letter="E" name="Progress-led" pitch="Quiet bones plus an indeterminate gradient bar and a friendly “Loading prices” label with bouncing dots.">
        <div className="flex flex-col gap-4">
          <div className="pt-indeterminate" />
          <span className="inline-flex items-center gap-2 font-ui text-ui text-muted">
            Loading prices <span className="pt-dots"><i /><i /><i /></span>
          </span>
          <BoneList bone="pt-skel pt-skel-e" />
        </div>
      </VariantCard>
    </PrototypeGroup>
  );
}
