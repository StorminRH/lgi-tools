import type { Tone } from './tones';

export type ChromeGlyph =
  | 'gas-cloud'
  | 'hacking-chip'
  | 'combat-reticle'
  | 'pilot'
  | 'station';

export type GlyphNode =
  | {
      readonly kind: 'path';
      readonly d: string;
      readonly fill?: 'currentColor' | 'none';
      readonly fillRule?: 'evenodd' | 'nonzero';
      readonly stroke?: 'currentColor';
      readonly strokeWidth?: number;
    }
  | {
      readonly kind: 'circle';
      readonly cx: number;
      readonly cy: number;
      readonly r: number;
      readonly fill?: 'currentColor' | 'none';
      readonly stroke?: 'currentColor';
      readonly strokeWidth?: number;
    }
  | {
      readonly kind: 'line';
      readonly x1: number;
      readonly y1: number;
      readonly x2: number;
      readonly y2: number;
      readonly stroke: 'currentColor';
      readonly strokeWidth: number;
    };

export const CHROME_GLYPHS: { readonly [K in ChromeGlyph]: readonly GlyphNode[] } = {
  'gas-cloud': [
    { kind: 'circle', cx: 5.2, cy: 9, r: 3.4 },
    { kind: 'circle', cx: 10.8, cy: 9, r: 3.4 },
    { kind: 'circle', cx: 8, cy: 6.2, r: 3.8 },
  ],
  'hacking-chip': [
    {
      kind: 'path',
      d: 'M8 1.4 13.6 4.6v6.8L8 14.6 2.4 11.4V4.6L8 1.4Zm0 2.3L4.4 5.7v4.6L8 12.3l3.6-2V5.7L8 3.7Z',
      fillRule: 'evenodd',
    },
  ],
  'combat-reticle': [
    {
      kind: 'circle',
      cx: 8,
      cy: 8,
      r: 5.5,
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.4,
    },
    { kind: 'line', x1: 8, y1: 3.2, x2: 8, y2: 6.3, stroke: 'currentColor', strokeWidth: 1.4 },
    { kind: 'line', x1: 8, y1: 9.7, x2: 8, y2: 12.8, stroke: 'currentColor', strokeWidth: 1.4 },
    { kind: 'line', x1: 3.2, y1: 8, x2: 6.3, y2: 8, stroke: 'currentColor', strokeWidth: 1.4 },
    { kind: 'line', x1: 9.7, y1: 8, x2: 12.8, y2: 8, stroke: 'currentColor', strokeWidth: 1.4 },
    { kind: 'circle', cx: 8, cy: 8, r: 1 },
  ],
  pilot: [
    { kind: 'circle', cx: 8, cy: 5, r: 3 },
    { kind: 'path', d: 'M3 14c0-2.8 2.2-5 5-5s5 2.2 5 5v1H3v-1Z' },
  ],
  station: [
    { kind: 'path', d: 'M7.2 1.6h1.6v1.2H7.2z' },
    { kind: 'path', d: 'M6.4 2.8h3.2v9.6H6.4z' },
    { kind: 'path', d: 'M3.2 6.4h2.6v5.2H3.2z' },
    { kind: 'path', d: 'M10.2 6.4h2.6v5.2h-2.6z' },
  ],
};

export type WidgetTone = Extract<Tone, 'teal' | 'blue' | 'red' | 'green' | 'yellow'>;

export function chromeToneClass(tone: WidgetTone): string {
  switch (tone) {
    case 'teal':
      return 'text-tone-teal';
    case 'blue':
      return 'text-tone-blue';
    case 'red':
      return 'text-tone-red';
    case 'green':
      return 'text-isk';
    case 'yellow':
      return 'text-tone-yellow';
    default: {
      const _never: never = tone;
      return _never;
    }
  }
}
