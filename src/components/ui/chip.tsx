import type { ReactNode } from 'react';
import { cn } from './cn';

export type ChipTone = 'blue' | 'red' | 'purple' | 'green' | 'orange';

const TONE: Record<ChipTone, string> = {
  blue:   'bg-[rgba(40,90,255,0.16)]  text-[#6688ff] border-[rgba(40,90,255,0.32)]',
  red:    'bg-[rgba(255,50,50,0.14)]  text-[#ff6666] border-[rgba(255,50,50,0.30)]',
  purple: 'bg-[rgba(170,70,255,0.14)] text-[#cc77ff] border-[rgba(170,70,255,0.30)]',
  green:  'bg-[rgba(0,200,120,0.13)]  text-[#33dd88] border-[rgba(0,200,120,0.28)]',
  orange: 'bg-[rgba(255,140,0,0.13)]  text-[#ffaa22] border-[rgba(255,140,0,0.32)]',
};

export function Chip({
  tone,
  children,
  className,
}: {
  tone: ChipTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center font-mono text-[9px] font-semibold px-[5px] py-px rounded-[2px] tracking-[0.08em] uppercase border leading-[1.5] shrink-0',
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
