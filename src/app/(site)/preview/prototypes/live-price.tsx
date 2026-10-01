'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/components/ui/cn';
import { LivePrice } from '@/components/ui/live-price';
import { ArrowDownIcon, ArrowUpIcon } from './icons';
import { PrototypeGroup, StateCell, VariantCard } from './gallery';

type Phase = 'settled' | 'pending' | 'landed';
type Dir = 'up' | 'down';
type Tick = { value: number; previous: number; phase: Phase; dir: Dir; tick: number };

const SEQUENCE = [312.4, 314.1, 309.8, 311.2] as const;
const PHASE_MS: Record<Phase, number> = { settled: 1600, pending: 1300, landed: 1700 };

const formatM = (value: number) => value.toFixed(1);
const deltaPct = (tick: Tick) => (((tick.value - tick.previous) / tick.previous) * 100).toFixed(1);

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

/** A still frame: animation off, moving parts held in a mid-motion pose. */
function Frozen({ children }: { children: ReactNode }) {
  return <div className="pt-freeze">{children}</div>;
}

const FRAMES: { label: string; tick: Tick }[] = [
  { label: 'pending', tick: { value: 312.4, previous: 312.4, phase: 'pending', dir: 'up', tick: 1 } },
  { label: 'landing', tick: { value: 314.1, previous: 312.4, phase: 'landed', dir: 'up', tick: 2 } },
  { label: 'settled · down', tick: { value: 309.8, previous: 314.1, phase: 'settled', dir: 'down', tick: 3 } },
];

type VariantProps = { tick: Tick; progress?: number };

function Filmstrip({ render, progress = 0.55 }: { render: (props: VariantProps) => ReactNode; progress?: number }) {
  const live = useLiveCycle();
  return (
    <div className="flex flex-col gap-5">
      <StateCell label={`live · ${live.phase}`}>{render({ tick: live })}</StateCell>
      <div className="grid gap-4 border-t border-border-soft pt-4 sm:grid-cols-3">
        {FRAMES.map((frame) => (
          <StateCell key={frame.label} label={frame.label}>
            <Frozen>
              {render({ tick: frame.tick, progress: frame.tick.phase === 'landed' ? progress : undefined })}
            </Frozen>
          </StateCell>
        ))}
      </div>
    </div>
  );
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

function Odometer({ tick, progress }: VariantProps) {
  const from = formatM(tick.previous);
  const to = formatM(tick.value);
  return (
    <span className="pt-price" data-dir={tick.dir}>
      <span
        key={tick.phase === 'landed' ? tick.tick : 'rest'}
        className="pt-odo"
        data-moved={tick.phase === 'landed' || undefined}
        data-pending={tick.phase === 'pending' || undefined}
      >
        {[...to].map((char, index) => {
          if (!/\d/.test(char)) return <span key={index}>{char}</span>;
          const target = Number(char);
          const start = Number(from[index] ?? char);
          const digit = progress === undefined ? target : start + (target - start) * progress;
          return <DigitColumn key={index} digit={digit} still={progress !== undefined} />;
        })}
      </span>
      <small>M ISK</small>
    </span>
  );
}

function SheenCrossfade({ tick }: VariantProps) {
  const pending = tick.phase === 'pending';
  const landed = tick.phase === 'landed';
  return (
    <span className="pt-price flex-wrap" data-dir={tick.dir}>
      <span key={landed ? tick.tick : 'rest'} className={cn('pt-sheen-text', landed && 'pt-blur-in')} data-pending={pending || undefined}>
        {formatM(tick.value)}
      </span>
      <small>M ISK</small>
      {landed ? (
        <span className="pt-delta">
          {tick.dir === 'up' ? '▲' : '▼'} {deltaPct(tick)}%
        </span>
      ) : null}
    </span>
  );
}

function OrbitCapsule({ tick }: VariantProps) {
  return (
    <span
      key={tick.phase === 'landed' ? tick.tick : 'rest'}
      className="pt-capsule pt-glass"
      data-pending={tick.phase === 'pending' || undefined}
      data-confirm={tick.phase === 'landed' || undefined}
    >
      <span className="pt-price pt-price-sm">
        {formatM(tick.value)}
        <small>M ISK</small>
      </span>
    </span>
  );
}

const SPARK_UP = 'M2 22 L14 18 L26 20 L38 12 L50 14 L62 6';
const SPARK_DOWN = 'M2 8 L14 10 L26 6 L38 14 L50 12 L62 20';

function DeltaTicker({ tick }: VariantProps) {
  const landed = tick.phase === 'landed';
  const delta = (tick.value - tick.previous).toFixed(1);
  return (
    <span className="flex items-center gap-4" data-dir={tick.dir}>
      <span
        key={landed ? tick.tick : 'rest'}
        className={cn('pt-price pt-ticker', tick.phase === 'pending' && 'opacity-60')}
        data-dir={tick.dir}
        data-moved={landed || undefined}
      >
        <span className="pt-ticker-arrow">{tick.dir === 'up' ? <ArrowUpIcon size={20} /> : <ArrowDownIcon size={20} />}</span>
        {formatM(tick.value)}
        <small>M ISK</small>
        {landed ? <span className="pt-float-delta">{Number(delta) > 0 ? `+${delta}M` : `${delta}M`}</span> : null}
      </span>
      <svg aria-hidden width="64" height="26" viewBox="0 0 64 26" className="pt-spark" data-dir={tick.dir}>
        <path d={tick.dir === 'up' ? SPARK_UP : SPARK_DOWN} fill="none" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
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

function CountUp({ tick, progress }: VariantProps) {
  const pending = tick.phase === 'pending';
  const tweened = useTween(tick.value, tick.previous, tick.phase === 'landed' && progress === undefined);
  const shown = progress === undefined ? tweened : tick.previous + (tick.value - tick.previous) * progress;
  return (
    <span className="pt-price" data-dir={tick.dir}>
      <span className="pt-tween" data-pending={pending || undefined}>{formatM(shown)}</span>
      <small>M ISK</small>
      {pending ? (
        <svg aria-label="Refreshing" width="18" height="18" viewBox="0 0 24 24" className="pt-arc self-center">
          <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity={0.2} strokeWidth={2.5} />
          <path d="M12 3a9 9 0 0 1 9 9" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" />
        </svg>
      ) : null}
    </span>
  );
}

function CurrentPrice() {
  const live = useLiveCycle();
  return (
    <StateCell label={`live · ${live.phase}`}>
      <LivePrice value={`${formatM(live.value)}M ISK`} pending={live.phase === 'pending'} className="text-xl text-isk" />
    </StateCell>
  );
}

export function LivePriceGroup() {
  return (
    <PrototypeGroup
      id="live-price"
      title="Live price"
      today="Today: a brightness pulse while pending, then a scale-and-glow flash in monospace green."
    >
      <VariantCard letter="Now" name="Pulse + flash" pitch="The shipping LivePrice, cycling on the same loop as the candidates.">
        <CurrentPrice />
      </VariantCard>
      <VariantCard letter="A" name="Odometer roll" pitch="Changed digits roll into place, tinted green when up and red when down. Unchanged digits stay still.">
        <Filmstrip render={(props) => <Odometer {...props} />} />
      </VariantCard>
      <VariantCard letter="B" name="Sheen + blur crossfade" pitch="A light sweeps through the number while pending; the new value blurs in from the move direction with a delta chip.">
        <Filmstrip render={(props) => <SheenCrossfade {...props} />} />
      </VariantCard>
      <VariantCard letter="C" name="Orbit capsule" pitch="The value sits in a glass capsule; a light orbits its edge while refreshing, then the edge flashes green.">
        <Filmstrip render={(props) => <OrbitCapsule {...props} />} />
      </VariantCard>
      <VariantCard letter="D" name="Delta ticker" pitch="An arrow springs in, the change floats up and fades, and a mini sparkline redraws. Most informative.">
        <Filmstrip render={(props) => <DeltaTicker {...props} />} />
      </VariantCard>
      <VariantCard letter="E" name="Count-up tween" pitch="The number counts from old to new with an expo ease; a small arc spinner marks the refresh.">
        <Filmstrip render={(props) => <CountUp {...props} />} />
      </VariantCard>
    </PrototypeGroup>
  );
}
