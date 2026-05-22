import { cn } from './cn';

export type DotTone = 'relic' | 'data';

const TONE: Record<DotTone, string> = {
  relic: 'bg-[#cc7733] shadow-[0_0_4px_rgba(204,119,51,0.4)]',
  data:  'bg-[#3399cc] shadow-[0_0_4px_rgba(51,153,204,0.4)]',
};

export function Dot({ tone }: { tone: DotTone }) {
  return <span className={cn('inline-block w-[6px] h-[6px] rounded-full shrink-0', TONE[tone])} />;
}
