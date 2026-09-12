import { cn } from './cn';
import {
  CHROME_GLYPHS,
  chromeToneClass,
  type ChromeGlyph,
  type WidgetTone,
} from './chrome-glyph';

export type ChromeFace = {
  readonly glyph: ChromeGlyph;
  readonly tone: WidgetTone;
};

export type MarkInfo =
  | { readonly kind: 'bare' }
  | {
      readonly kind: 'count';
      readonly value: number;
      readonly dataKey?: string;
    };

function ChromeIcon({ glyph }: { readonly glyph: ChromeGlyph }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="size-full">
      {CHROME_GLYPHS[glyph].map((node, index) => {
        switch (node.kind) {
          case 'path':
            return (
              <path
                key={index}
                d={node.d}
                fill={node.fill ?? 'currentColor'}
                fillRule={node.fillRule}
                stroke={node.stroke}
                strokeWidth={node.strokeWidth}
              />
            );
          case 'circle':
            return (
              <circle
                key={index}
                cx={node.cx}
                cy={node.cy}
                r={node.r}
                fill={node.fill ?? 'currentColor'}
                stroke={node.stroke}
                strokeWidth={node.strokeWidth}
              />
            );
          case 'line':
            return (
              <line
                key={index}
                x1={node.x1}
                y1={node.y1}
                x2={node.x2}
                y2={node.y2}
                stroke={node.stroke}
                strokeWidth={node.strokeWidth}
              />
            );
          default: {
            const _never: never = node;
            return _never;
          }
        }
      })}
    </svg>
  );
}

function ChromeGlyphMark({ glyph, tone }: ChromeFace) {
  return (
    <span
      className={cn(
        'inline-flex size-icon-sm items-center justify-center',
        chromeToneClass(tone),
      )}
    >
      <ChromeIcon glyph={glyph} />
    </span>
  );
}

export function NodeMark({
  glyph,
  tone,
  info,
}: ChromeFace & { readonly info: MarkInfo }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      <ChromeGlyphMark glyph={glyph} tone={tone} />
      {info.kind === 'count' ? (
        <span
          {...(info.dataKey === undefined ? {} : { [info.dataKey]: '' })}
          className="font-data text-micro text-muted"
        >
          {info.value}
        </span>
      ) : null}
    </span>
  );
}

export function TitleMetric({
  glyph,
  tone,
  caption,
  dataAttr,
}: ChromeFace & { readonly caption: string; readonly dataAttr: string }) {
  return (
    <span
      {...{ [dataAttr]: '' }}
      className="inline-flex items-center gap-0.5 font-data text-micro leading-none text-muted"
    >
      <ChromeGlyphMark glyph={glyph} tone={tone} />
      <span>{caption}</span>
    </span>
  );
}
