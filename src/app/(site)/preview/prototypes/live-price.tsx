'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/components/ui/cn';
import { LivePrice } from '@/components/ui/live-price';
import { PrototypeGroup, StateCell, VariantCard } from './gallery';

/*
 * LivePrice takes a value string and a pending flag, nothing else. Every card
 * renders exactly that string ("312.4M ISK") on the same loop; only the
 * pending and confirm motion differ. Each card also shows three still frames
 * so the motion reads in a screenshot.
 */

type Phase = 'settled' | 'pending' | 'landed';
type Dir = 'up' | 'down';
type Tick = { value: number; previous: number; phase: Phase; dir: Dir; tick: number };

const SEQUENCE = [312.4, 314.1, 309.8, 311.2] as const;
const PHASE_MS: Record<Phase, number> = { settled: 1600, pending: 1300, landed: 1700 };

const formatM = (value: number) => value.toFixed(1);
const label = (value: number) => `${formatM(value)}M ISK`;

/** Cycles a sample price through settled → pending → landed on a loop. */
function useLiveCycle(): Tick {
  const [state, setState] = useState<Tick>({ value: SEQUENCE[0], previous: SEQUENCE[0], phase: 'settled', dir: 'up', tick: 0 });
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setState((current) => {
        if (current.phase === 'settled') return { ...current, phase: 'pending' };
        if (current.phase === 'landed') return { ...current, phase: 'settled' };
        const next = SEQUENCE[(current.tick + 1) % SEQUENCE.length] ?? SEQUENCE[0];
        return { value: next, previous: current.value, phase: 'landed', dir: next >= current.value ? 'up' : 'down', tick: current.tick + 1 };
      });
    }, PHASE_MS[state.phase]);
    return () => window.clearTimeout(timer);
  }, [state.phase]);
  return state;
}

const FRAMES: { label: string; tick: Tick }[] = [
  { label: 'pending', tick: { value: 312.4, previous: 312.4, phase: 'pending', dir: 'up', tick: 1 } },
  { label: 'landing', tick: { value: 314.1, previous: 312.4, phase: 'landed', dir: 'up', tick: 2 } },
  { label: 'settled', tick: { value: 314.1, previous: 312.4, phase: 'settled', dir: 'up', tick: 3 } },
];

type VariantProps = { tick: Tick; still?: boolean };

/** Live loop on top, three still frames below (animation off, mid-motion pose held). */
function Filmstrip({ render }: { render: (props: VariantProps) => ReactNode }) {
  const live = useLiveCycle();
  return (
    <div className="flex flex-col gap-5">
      <StateCell label={`live · ${live.phase}`}>{render({ tick: live })}</StateCell>
      <div className="grid gap-4 border-t border-border-soft pt-4 sm:grid-cols-3">
        {FRAMES.map((frame) => (
          <StateCell key={frame.label} label={frame.label}>
            <div className="pt-freeze">{render({ tick: frame.tick, still: true })}</div>
          </StateCell>
        ))}
      </div>
    </div>
  );
}

/** Keyed on the tick while landed so each confirm replays its animation. */
function phaseKey(tick: Tick) {
  return tick.phase === 'landed' ? tick.tick : 'rest';
}

function DigitColumn({ digit, still }: { digit: number; still: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    ref.current?.style.setProperty('--digit', String(digit));
  }, [digit]);
  return (
    <span className="pt-odo-col">
      <span ref={ref} className={cn('pt-odo-strip', still && 'transition-none')}>
        {Array.from({ length: 10 }, (_, n) => <span key={n}>{n}</span>)}
      </span>
    </span>
  );
}

function Odometer({ tick, still = false }: VariantProps) {
  const from = formatM(tick.previous);
  const to = formatM(tick.value);
  const midRoll = still && tick.phase === 'landed';
  return (
    <span className="pt-price" data-dir={tick.dir}>
      <span key={phaseKey(tick)} className="pt-odo" data-moved={tick.phase === 'landed' || undefined} data-pending={tick.phase === 'pending' || undefined}>
        {[...to].map((char, index) => {
          if (!/\d/.test(char)) return <span key={index}>{char}</span>;
          const start = Number(from[index] ?? char);
          const digit = midRoll ? start + (Number(char) - start) * 0.55 : Number(char);
          return <DigitColumn key={index} digit={digit} still={still} />;
        })}
        M ISK
      </span>
    </span>
  );
}

function SheenCrossfade({ tick }: VariantProps) {
  const landed = tick.phase === 'landed';
  return (
    <span className="pt-price" data-dir={tick.dir}>
      <span key={phaseKey(tick)} className={cn('pt-sheen-text', landed && 'pt-blur-in')} data-pending={tick.phase === 'pending' || undefined}>
        {label(tick.value)}
      </span>
    </span>
  );
}

function UnderlineOrbit({ tick }: VariantProps) {
  return (
    <span
      key={phaseKey(tick)}
      className="pt-price pt-uline"
      data-pending={tick.phase === 'pending' || undefined}
      data-confirm={tick.phase === 'landed' || undefined}
    >
      {label(tick.value)}
    </span>
  );
}

function Bloom({ tick }: VariantProps) {
  return (
    <span
      key={phaseKey(tick)}
      className="pt-price pt-bloom"
      data-pending={tick.phase === 'pending' || undefined}
      data-confirm={tick.phase === 'landed' || undefined}
    >
      {label(tick.value)}
    </span>
  );
}

const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));

function useTween(target: number, from: number, run: boolean) {
  const [shown, setShown] = useState(from);
  useEffect(() => {
    if (!run) return;
    let frame = 0;
    const started = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - started) / 800);
      setShown(from + (target - from) * easeOutExpo(t));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, from, run]);
  return run ? shown : target;
}

function CountUp({ tick, still = false }: VariantProps) {
  const landed = tick.phase === 'landed';
  const tweened = useTween(tick.value, tick.previous, landed && !still);
  const shown = still && landed ? tick.previous + (tick.value - tick.previous) * 0.55 : tweened;
  return (
    <span className="pt-price pt-tween" data-pending={tick.phase === 'pending' || undefined}>
      {label(shown)}
    </span>
  );
}

function CurrentPrice() {
  const live = useLiveCycle();
  return (
    <div className="flex flex-col gap-5">
      <StateCell label={`live · ${live.phase}`}>
        <LivePrice value={label(live.value)} pending={live.phase === 'pending'} className="text-xl text-isk" />
      </StateCell>
      <div className="grid gap-4 border-t border-border-soft pt-4 sm:grid-cols-3">
        {FRAMES.map((frame) => (
          <StateCell key={frame.label} label={frame.label}>
            <LivePrice value={label(frame.tick.value)} pending={frame.tick.phase === 'pending'} className="text-xl text-isk" />
          </StateCell>
        ))}
      </div>
    </div>
  );
}

export function LivePriceGroup() {
  return (
    <PrototypeGroup
      id="live-price"
      title="Live price"
      today="Every card renders the same LivePrice value on the same loop. Only the pending and confirm motion change."
    >
      <VariantCard letter="Now" name="Pulse + flash" pitch="The shipping LivePrice: a brightness pulse while pending, then a scale-and-glow flash, in monospace.">
        <CurrentPrice />
      </VariantCard>
      <VariantCard letter="A" name="Odometer roll" pitch="Changed digits roll into place, tinted green when the price rose and red when it fell. Unchanged digits stay still.">
        <Filmstrip render={(props) => <Odometer {...props} />} />
      </VariantCard>
      <VariantCard letter="B" name="Sheen + blur crossfade" pitch="A light sweeps through the number while pending; the new value blurs in from the direction it moved.">
        <Filmstrip render={(props) => <SheenCrossfade {...props} />} />
      </VariantCard>
      <VariantCard letter="C" name="Underline orbit" pitch="A light runs along a hairline under the value while refreshing, then the line flashes green when it lands.">
        <Filmstrip render={(props) => <UnderlineOrbit {...props} />} />
      </VariantCard>
      <VariantCard letter="D" name="Soft bloom" pitch="Pending breathes the value dim and bright; the confirm is a soft green halo that blooms behind the number and fades.">
        <Filmstrip render={(props) => <Bloom {...props} />} />
      </VariantCard>
      <VariantCard letter="E" name="Count-up tween" pitch="The number counts from the old value to the new one with an expo ease; pending dims it.">
        <Filmstrip render={(props) => <CountUp {...props} />} />
      </VariantCard>
    </PrototypeGroup>
  );
}
