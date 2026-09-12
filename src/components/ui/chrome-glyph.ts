import type { Tone } from './tones';

export type ChromeGlyph =
  | 'gas-cloud'
  | 'hacking-chip'
  | 'combat-reticle'
  | 'pilot'
  | 'market';

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

function ringCircle(cx: number, cy: number, r: number, wall: number): GlyphNode {
  const inner = r - wall;
  return {
    kind: 'path',
    fillRule: 'evenodd',
    d: `M${cx} ${cy - r}a${r} ${r} 0 1 1 0 ${2 * r}a${r} ${r} 0 1 1 0 ${-2 * r}ZM${cx} ${cy - inner}a${inner} ${inner} 0 1 0 0 ${2 * inner}a${inner} ${inner} 0 1 0 0 ${-2 * inner}Z`,
  };
}

export const CHROME_GLYPHS: { readonly [K in ChromeGlyph]: readonly GlyphNode[] } = {
  'gas-cloud': [
    {
      kind: 'path',
      d: 'M11.05 12.5H6.2a4 4 0 1 1 3.83-5.14h1.02a2.57 2.57 0 1 1 0 5.14Z',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.5,
    },
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
    ringCircle(8, 5, 3, 1.5),
    {
      kind: 'path',
      fillRule: 'evenodd',
      d: 'M3 14c0-2.8 2.2-5 5-5s5 2.2 5 5v1H3v-1ZM4.5 13.5c0-1.6 1.55-2.9 3.5-2.9s3.5 1.3 3.5 2.9v.4H4.5v-.4Z',
    },
  ],
  market: [
    {
      kind: 'path',
      d: 'M2.8 2.5V13.5H13.5',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.3,
    },
    {
      kind: 'path',
      d: 'M2.8 8.2L4.8 6.3L6.3 10.8L8.6 8.3L10.4 8.8L12.2 5.2',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.4,
    },
    { kind: 'circle', cx: 12.9, cy: 4.5, r: 1.1 },
  ],
};

export type ChromeTone = Extract<Tone, 'teal' | 'blue' | 'red' | 'green' | 'yellow'>;

export type ChromeFace = {
  readonly glyph: ChromeGlyph;
  readonly tone: ChromeTone;
};

export type MarkInfo =
  | { readonly kind: 'bare' }
  | {
      readonly kind: 'count';
      readonly value: number;
      readonly dataKey?: string;
    };

export type NodeMarkToken = ChromeFace & { readonly info: MarkInfo };

export function chromeToneClass(tone: ChromeTone): string {
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
