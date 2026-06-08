import { cva } from 'class-variance-authority';
import type { DotTone } from './tones';

export type { DotTone };

const dotVariants = cva('inline-block w-[6px] h-[6px] rounded-full shrink-0', {
  variants: {
    tone: {
      orange: 'bg-tone-orange-soft shadow-[0_0_4px_var(--color-dot-orange-glow)]',
      blue:   'bg-tone-blue shadow-[0_0_4px_var(--color-dot-blue-glow)]',
    } satisfies Record<DotTone, string>,
  },
});

export function Dot({ tone }: { tone: DotTone }) {
  return <span className={dotVariants({ tone })} />;
}
