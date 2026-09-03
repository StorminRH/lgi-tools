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

export type PillTone = Tone;

export type ChipTone = Extract<Tone, 'blue' | 'red' | 'purple' | 'green' | 'orange'>;

export type DotTone = Extract<Tone, 'orange' | 'blue' | 'green' | 'red' | 'neutral'>;

export const toneHex: Record<Tone, string> = {
  neutral: '#6a7a8a',
  green: '#3dd68c',
  'green-strong': '#44dd99',
  orange: '#d68c3d',
  'orange-soft': '#cc7733',
  red: '#dd4444',
  'red-soft': '#cc5555',
  magenta: '#cc55cc',
  purple: '#aa55ff',
  yellow: '#ccaa33',
  teal: '#33cc88',
  blue: '#3399cc',
};

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
