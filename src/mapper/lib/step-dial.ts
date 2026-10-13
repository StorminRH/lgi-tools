import { clamp } from '@/lib/math';

/**
 * A numeric dev dial: its row label, its stepper's accessible name, the range
 * it moves through, and how it reads and writes the config it tunes.
 */
export interface StepDial<C> {
  readonly label: string;
  readonly ariaLabel: string;
  readonly range: { readonly min: number; readonly max: number; readonly step: number };
  readonly valueClassName?: string;
  readonly read: (config: C) => number;
  /** Receives a value already clamped to `range` and snapped to its step. */
  readonly write: (config: C, value: number) => C;
}

/** A dev dial that picks one of a closed set of options. */
export interface ChoiceDial<C, V extends string = string> {
  readonly label: string;
  readonly control: 'segmented' | 'select';
  readonly options: readonly { readonly value: V; readonly label: string }[];
  readonly read: (config: C) => V;
  readonly write: (config: C, value: V) => C;
}

/**
 * Clamps `next` into the dial's range and snaps it to the step grid before the
 * dial writes it, so a write that couples two fields sees the final value.
 */
export function commitStepDial<C>(dial: StepDial<C>, config: C, next: number): C {
  const { min, max, step } = dial.range;
  const steps = Math.round((clamp(next, min, max) - min) / step);
  return dial.write(config, min + steps * step);
}

/**
 * Widens a typed choice dial to the plain strings its control reports. A value
 * that is not one of the dial's options leaves the config unchanged.
 */
export function choiceDial<C, V extends string>(dial: ChoiceDial<C, V>): ChoiceDial<C> {
  const isOption = (value: string): value is V =>
    dial.options.some((option) => option.value === value);
  return {
    ...dial,
    write: (config, value) => (isOption(value) ? dial.write(config, value) : config),
  };
}
