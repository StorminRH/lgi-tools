import { cva } from 'class-variance-authority';
import { cn } from './cn';
import type { DotTone } from './tones';

export type { DotTone };

const dotVariants = cva('inline-block w-[6px] h-[6px] rounded-full shrink-0', {
  variants: {
    tone: {
      orange: 'bg-[#cc7733] shadow-[0_0_4px_rgba(204,119,51,0.4)]',
      blue:   'bg-[#3399cc] shadow-[0_0_4px_rgba(51,153,204,0.4)]',
    } satisfies Record<DotTone, string>,
  },
});

export function Dot({ tone }: { tone: DotTone }) {
  return <span className={cn(dotVariants({ tone }))} />;
}
