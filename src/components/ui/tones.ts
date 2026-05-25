// Shared tone vocabulary. Any feature's domain → UI mapping picks from this
// set. Primitive components (Pill, Chip, Dot) and feature-styles modules
// (wormhole-styles, future industry-styles, …) all import their tone types
// from here so the palette has one home.

export type Tone =
  | 'neutral'
  | 'green'
  | 'green-strong'
  | 'orange'
  | 'orange-soft'
  | 'red'
  | 'red-soft'
  | 'magenta'
  | 'purple'
  | 'yellow'
  | 'teal'
  | 'blue';

// Pill consumes the full Tone vocabulary.
export type PillTone = Tone;

// Chip is a deliberate subset — EWAR / status chips use the saturated
// families only.
export type ChipTone = Extract<Tone, 'blue' | 'red' | 'purple' | 'green' | 'orange'>;

// Dot is a smaller subset still — hackable container indicators use the
// cool / warm split today.
export type DotTone = Extract<Tone, 'orange' | 'blue'>;

// Text-only tone for inline values like DPS tier labels. Returns a Tailwind
// className that sets text color from the shared palette tokens defined in
// globals.css. Use for primitives that render bare text (not Pill / Chip).
export function toneTextClass(tone: Extract<Tone, 'green' | 'orange' | 'red'>): string {
  switch (tone) {
    case 'green':
      return 'text-[var(--color-isk)]';
    case 'orange':
      return 'text-[var(--color-dps-mid)]';
    case 'red':
      return 'text-[var(--color-dps-high)]';
  }
}
