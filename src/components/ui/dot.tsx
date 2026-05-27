import { cn } from './cn';
import type { DotTone } from './tones';

export type { DotTone };

const TONE: Record<DotTone, string> = {
  orange: 'bg-[#cc7733] shadow-[0_0_4px_rgba(204,119,51,0.4)]',
  blue:   'bg-[#3399cc] shadow-[0_0_4px_rgba(51,153,204,0.4)]',
};

export function Dot({ tone }: { tone: DotTone }) {
  return <span className={cn('inline-block w-[6px] h-[6px] rounded-full shrink-0', TONE[tone])} />;
}
