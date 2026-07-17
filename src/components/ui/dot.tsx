import { cva } from 'class-variance-authority';
import type { DotTone } from './tones';

export type { DotTone };

const dotVariants = cva('inline-block w-[6px] h-[6px] rounded-full shrink-0', {
  variants: {
    tone: {
      orange: 'bg-tone-orange-soft shadow-dot-orange',
      blue:   'bg-tone-blue shadow-dot-blue',
    } satisfies Record<DotTone, string>,
  },
});

/**
 * Renders the domain-neutral dot with house behavior and tokens; callers own semantic meaning and
 * content while this primitive owns presentation.
 */
export function Dot({ tone }: { tone: DotTone }) {
  return <span className={dotVariants({ tone })} />;
}
